import {
  CompressionOutcome,
  PhotoMetadata,
  ProgressStep,
} from '../types/compression';
import {
  calculateCompressionStats,
  formatBytes,
  generateCompressedFilename,
} from './units';

interface EncodedCandidate {
  blob: Blob;
  width: number;
  height: number;
  quality: number;
  mimeType: string;
}

/**
 * Encodes an HTMLImageElement onto a canvas at the specified dimensions, format, and quality.
 */
async function encodeImageAtSettings(
  img: HTMLImageElement,
  width: number,
  height: number,
  mimeType: string,
  quality: number,
  fillWhiteBackground: boolean
): Promise<Blob> {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));

  const canvas = document.createElement('canvas');
  canvas.width = safeWidth;
  canvas.height = safeHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser canvas context is unavailable for image compression.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (fillWhiteBackground) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, safeWidth, safeHeight);
  } else {
    ctx.clearRect(0, 0, safeWidth, safeHeight);
  }

  ctx.drawImage(img, 0, 0, safeWidth, safeHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), mimeType, quality);
  });

  // Free canvas memory immediately
  canvas.width = 0;
  canvas.height = 0;

  if (!blob) {
    throw new Error(`Browser failed to encode the image as ${mimeType}.`);
  }

  return blob;
}

/**
 * Checks whether the current browser genuinely supports WebP encoding via canvas.toBlob.
 */
let cachedWebpSupport: boolean | null = null;
async function supportsWebpEncoding(): Promise<boolean> {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.8)
    );
    cachedWebpSupport = Boolean(blob && blob.type === 'image/webp');
    return cachedWebpSupport;
  } catch {
    cachedWebpSupport = false;
    return false;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Compression cancelled by user.', 'AbortError');
  }
}

/**
 * Compresses a photo iteratively to approach the requested target output size in bytes.
 */
export async function compressPhotoToTarget(
  file: File,
  metadata: PhotoMetadata,
  targetBytes: number,
  onProgress: (step: ProgressStep) => void,
  signal?: AbortSignal
): Promise<CompressionOutcome> {
  throwIfAborted(signal);
  onProgress('preparing');

  const originalBytes = file.size;

  // CASE C: Original file is already smaller than or equal to the target size
  if (originalBytes <= targetBytes) {
    onProgress('checking');
    return {
      status: 'already_smaller',
      statusHeading: 'Original file is already below the target size.',
      explanation: `Your photo (${formatBytes(originalBytes)}) is already smaller than or equal to the requested target of ${formatBytes(targetBytes)}. We kept the original file untouched to avoid unnecessary quality loss.`,
      outputBlob: file,
      outputBytes: originalBytes,
      outputFileName: generateCompressedFilename(file.name, metadata.mimeType),
      outputMimeType: metadata.mimeType,
      originalBytes,
      originalFileName: file.name,
      requestedTargetBytes: targetBytes,
      bytesSaved: 0,
      percentageSaved: 0,
      outputWidth: metadata.width,
      outputHeight: metadata.height,
      qualityUsed: 1,
      iterationsRun: 0,
    };
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Failed to decode source image for compression.'));
    element.src = metadata.previewUrl;
  });

  throwIfAborted(signal);
  onProgress('compressing');

  const webpSupported = await supportsWebpEncoding();

  // Select output MIME type:
  // - If image has transparency: use image/webp (supports lossy + alpha) if supported, else image/png
  // - If image is opaque:
  //   - For JPEG input: prefer image/jpeg (and also check image/webp for very tight targets)
  //   - For PNG/WebP input: prefer image/webp if supported, else image/jpeg
  let targetMimeType = metadata.mimeType;
  if (metadata.hasTransparency) {
    targetMimeType = webpSupported ? 'image/webp' : 'image/png';
  } else if (metadata.mimeType === 'image/png') {
    targetMimeType = webpSupported ? 'image/webp' : 'image/jpeg';
  } else if (metadata.mimeType === 'image/webp' && !webpSupported) {
    targetMimeType = 'image/jpeg';
  }

  const fillWhiteBackground = targetMimeType === 'image/jpeg';

  let iterationsRun = 0;
  let bestUnderTarget: EncodedCandidate | null = null;
  let smallestCandidate: EncodedCandidate | null = null;

  const recordCandidate = (candidate: EncodedCandidate) => {
    if (!smallestCandidate || candidate.blob.size < smallestCandidate.blob.size) {
      smallestCandidate = candidate;
    }
    if (candidate.blob.size <= targetBytes) {
      if (
        !bestUnderTarget ||
        candidate.blob.size > bestUnderTarget.blob.size ||
        (candidate.width > bestUnderTarget.width && candidate.quality >= bestUnderTarget.quality)
      ) {
        bestUnderTarget = candidate;
      }
    }
  };

  const origW = metadata.width;
  const origH = metadata.height;

  // Step 1: Binary search on encoding quality at 100% original dimensions (when format supports quality)
  if (targetMimeType !== 'image/png') {
    let lowQ = 0.06;
    let highQ = 0.95;

    for (let i = 0; i < 7; i++) {
      throwIfAborted(signal);
      const midQ = i === 0 ? 0.82 : Number(((lowQ + highQ) / 2).toFixed(3));
      const blob = await encodeImageAtSettings(
        img,
        origW,
        origH,
        targetMimeType,
        midQ,
        fillWhiteBackground
      );
      iterationsRun++;

      recordCandidate({
        blob,
        width: origW,
        height: origH,
        quality: midQ,
        mimeType: targetMimeType,
      });

      // If within 3% below targetBytes at full resolution, stop early
      if (blob.size <= targetBytes && blob.size >= targetBytes * 0.95) {
        break;
      }

      if (blob.size > targetBytes) {
        highQ = midQ;
      } else {
        lowQ = midQ;
      }
    }

    // If source was JPEG and full-res JPEG couldn't reach target at decent quality (>= 0.45),
    // also test WebP at full resolution before downscaling
    if (
      targetMimeType === 'image/jpeg' &&
      webpSupported &&
      (!bestUnderTarget || bestUnderTarget.quality < 0.45)
    ) {
      let wLow = 0.08;
      let wHigh = 0.9;
      for (let i = 0; i < 5; i++) {
        throwIfAborted(signal);
        const wMid = Number(((wLow + wHigh) / 2).toFixed(3));
        const blob = await encodeImageAtSettings(img, origW, origH, 'image/webp', wMid, false);
        iterationsRun++;
        recordCandidate({
          blob,
          width: origW,
          height: origH,
          quality: wMid,
          mimeType: 'image/webp',
        });
        if (blob.size > targetBytes) {
          wHigh = wMid;
        } else {
          wLow = wMid;
        }
      }
    }
  }

  // Step 2: If target was not reached at full dimensions (or required extremely low quality < 0.35),
  // progressively reduce dimensions while maintaining exact aspect ratio.
  const needsDownscaling =
    !bestUnderTarget || (targetMimeType !== 'image/png' && bestUnderTarget.quality < 0.32);

  if (needsDownscaling) {
    const minDimensionFloor = 48; // Minimum 48px on shortest side to keep a valid recognizable image
    const minScale = Math.min(
      0.9,
      Math.max(0.05, minDimensionFloor / Math.min(origW, origH))
    );

    const scaleSteps = [0.85, 0.7, 0.55, 0.4, 0.28, 0.18, 0.12, minScale].filter(
      (s, index, arr) => s >= minScale && arr.indexOf(s) === index
    );

    for (const scale of scaleSteps) {
      throwIfAborted(signal);
      const scaledW = Math.max(1, Math.round(origW * scale));
      const scaledH = Math.max(1, Math.round(origH * scale));

      if (targetMimeType === 'image/png') {
        const blob = await encodeImageAtSettings(
          img,
          scaledW,
          scaledH,
          'image/png',
          0.9,
          false
        );
        iterationsRun++;
        recordCandidate({
          blob,
          width: scaledW,
          height: scaledH,
          quality: 1,
          mimeType: 'image/png',
        });
        if (blob.size <= targetBytes) {
          break;
        }
      } else {
        // Test mid-good quality (0.68) and low quality (0.25) at this scale
        const midBlob = await encodeImageAtSettings(
          img,
          scaledW,
          scaledH,
          targetMimeType,
          0.68,
          fillWhiteBackground
        );
        iterationsRun++;
        recordCandidate({
          blob: midBlob,
          width: scaledW,
          height: scaledH,
          quality: 0.68,
          mimeType: targetMimeType,
        });

        if (midBlob.size <= targetBytes) {
          // Refine quality upward at this scale to get closer to targetBytes
          let lq = 0.68;
          let hq = 0.92;
          for (let qStep = 0; qStep < 3; qStep++) {
            throwIfAborted(signal);
            const mq = Number(((lq + hq) / 2).toFixed(3));
            const refinedBlob = await encodeImageAtSettings(
              img,
              scaledW,
              scaledH,
              targetMimeType,
              mq,
              fillWhiteBackground
            );
            iterationsRun++;
            recordCandidate({
              blob: refinedBlob,
              width: scaledW,
              height: scaledH,
              quality: mq,
              mimeType: targetMimeType,
            });
            if (refinedBlob.size > targetBytes) {
              hq = mq;
            } else {
              lq = mq;
            }
          }
          break;
        } else {
          // Try lower quality at this scale before shrinking dimensions further
          const lowBlob = await encodeImageAtSettings(
            img,
            scaledW,
            scaledH,
            targetMimeType,
            0.22,
            fillWhiteBackground
          );
          iterationsRun++;
          recordCandidate({
            blob: lowBlob,
            width: scaledW,
            height: scaledH,
            quality: 0.22,
            mimeType: targetMimeType,
          });

          if (lowBlob.size <= targetBytes) {
            // Binary search quality between 0.22 and 0.68 at this scale
            let lq = 0.22;
            let hq = 0.68;
            for (let qStep = 0; qStep < 4; qStep++) {
              throwIfAborted(signal);
              const mq = Number(((lq + hq) / 2).toFixed(3));
              const refinedBlob = await encodeImageAtSettings(
                img,
                scaledW,
                scaledH,
                targetMimeType,
                mq,
                fillWhiteBackground
              );
              iterationsRun++;
              recordCandidate({
                blob: refinedBlob,
                width: scaledW,
                height: scaledH,
                quality: mq,
                mimeType: targetMimeType,
              });
              if (refinedBlob.size > targetBytes) {
                hq = mq;
              } else {
                lq = mq;
              }
            }
            break;
          }
        }
      }
    }
  }

  throwIfAborted(signal);
  onProgress('checking');

  const chosen: EncodedCandidate | null = bestUnderTarget || smallestCandidate;

  if (!chosen) {
    throw new Error('Could not generate a valid compressed image.');
  }

  // CASE D: Even the smallest generated output is larger than or equal to the original
  if (chosen.blob.size >= originalBytes) {
    const stats = calculateCompressionStats(originalBytes, chosen.blob.size);
    return {
      status: 'no_reduction_possible',
      statusHeading: 'Meaningful size reduction was not possible.',
      explanation:
        'This photo is already tightly encoded. Re-compressing it did not produce a smaller file.',
      outputBlob: file,
      outputBytes: originalBytes,
      outputFileName: generateCompressedFilename(file.name, metadata.mimeType),
      outputMimeType: metadata.mimeType,
      originalBytes,
      originalFileName: file.name,
      requestedTargetBytes: targetBytes,
      bytesSaved: stats.bytesSaved > 0 ? stats.bytesSaved : 0,
      percentageSaved: stats.percentageSaved > 0 ? stats.percentageSaved : 0,
      outputWidth: metadata.width,
      outputHeight: metadata.height,
      qualityUsed: 1,
      iterationsRun,
    };
  }

  const stats = calculateCompressionStats(originalBytes, chosen.blob.size);
  const resizedNote =
    chosen.width !== origW || chosen.height !== origH
      ? ` Dimensions were scaled proportionally from ${origW}×${origH} to ${chosen.width}×${chosen.height} to fit your target.`
      : '';

  // CASE A: Target achieved
  if (chosen.blob.size <= targetBytes) {
    return {
      status: 'target_reached',
      statusHeading: 'Target size reached.',
      explanation: `Compressed to ${formatBytes(chosen.blob.size)} (target: ${formatBytes(targetBytes)}).${resizedNote}`,
      outputBlob: chosen.blob,
      outputBytes: chosen.blob.size,
      outputFileName: generateCompressedFilename(file.name, chosen.mimeType),
      outputMimeType: chosen.mimeType,
      originalBytes,
      originalFileName: file.name,
      requestedTargetBytes: targetBytes,
      bytesSaved: stats.bytesSaved,
      percentageSaved: stats.percentageSaved,
      outputWidth: chosen.width,
      outputHeight: chosen.height,
      qualityUsed: chosen.quality,
      iterationsRun,
    };
  }

  // CASE B: Target not achievable
  return {
    status: 'closest_possible',
    statusHeading: 'Target size could not be reached. Here is the closest result we could produce.',
    explanation: `Requested target was ${formatBytes(targetBytes)}, and the smallest valid output we could produce while keeping a usable image (${chosen.width}×${chosen.height}) is ${formatBytes(chosen.blob.size)}.`,
    outputBlob: chosen.blob,
    outputBytes: chosen.blob.size,
    outputFileName: generateCompressedFilename(file.name, chosen.mimeType),
    outputMimeType: chosen.mimeType,
    originalBytes,
    originalFileName: file.name,
    requestedTargetBytes: targetBytes,
    bytesSaved: stats.bytesSaved,
    percentageSaved: stats.percentageSaved,
    outputWidth: chosen.width,
    outputHeight: chosen.height,
    qualityUsed: chosen.quality,
    iterationsRun,
  };
}
