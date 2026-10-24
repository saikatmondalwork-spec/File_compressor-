import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  CompressionOutcome,
  PdfMetadata,
  PendingPdfRasterState,
  ProgressStep,
} from '../types/compression';
import {
  calculateCompressionStats,
  formatBytes,
  generateCompressedFilename,
} from './units';

// Configure PDF.js worker for browser rendering
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfInitialResult =
  | { kind: 'completed'; outcome: CompressionOutcome }
  | { kind: 'needs_raster_confirmation'; pending: PendingPdfRasterState };

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Compression cancelled by user.', 'AbortError');
  }
}

/**
 * Attempts to re-encode an embedded DCTDecode (JPEG) image stream inside a PDF
 * while preserving the PDF document's selectable text, fonts, and vector graphics.
 */
async function recompressEmbeddedJpegBytes(
  jpegBytes: Uint8Array,
  scale: number,
  quality: number
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Embedded JPEG decode failed'));
      el.src = url;
    });

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    if (origW < 32 || origH < 32) return null;

    const targetW = Math.max(16, Math.round(origW * scale));
    const targetH = Math.max(16, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const outBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    canvas.width = 0;
    canvas.height = 0;

    if (!outBlob || outBlob.size >= jpegBytes.byteLength) {
      return null;
    }

    const outBuffer = await outBlob.arrayBuffer();
    return {
      bytes: new Uint8Array(outBuffer),
      width: targetW,
      height: targetH,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Runs a single content-preserving optimization pass on the PDF bytes.
 * Strips metadata bloat, enables PDF object streams, and optionally re-encodes
 * standard embedded DCTDecode (JPEG) streams while keeping all text and vector graphics intact.
 */
async function runContentPreservingPass(
  sourceBuffer: ArrayBuffer,
  imageScale: number,
  imageQuality: number,
  recompressImages: boolean,
  signal?: AbortSignal
): Promise<Uint8Array> {
  throwIfAborted(signal);
  const pdfDoc = await PDFDocument.load(sourceBuffer, {
    updateMetadata: false,
  });

  // Strip non-essential document metadata bloat
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');

  try {
    pdfDoc.catalog.delete(PDFName.of('Metadata'));
  } catch {
    // Ignore if catalog has no XMP Metadata entry
  }

  if (recompressImages) {
    const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
    for (const [, obj] of indirectObjects) {
      throwIfAborted(signal);
      if (obj instanceof PDFRawStream) {
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of('Subtype'));
        const filter = dict.get(PDFName.of('Filter'));
        const smask = dict.get(PDFName.of('SMask'));
        const mask = dict.get(PDFName.of('Mask'));
        const colorSpace = dict.get(PDFName.of('ColorSpace'));

        // Only touch standalone DCTDecode (JPEG) images in DeviceRGB or DeviceGray without masks
        const isSafeColorSpace =
          colorSpace === PDFName.of('DeviceRGB') || colorSpace === PDFName.of('DeviceGray');

        if (
          subtype === PDFName.of('Image') &&
          filter === PDFName.of('DCTDecode') &&
          !smask &&
          !mask &&
          isSafeColorSpace &&
          obj.contents.byteLength > 4096
        ) {
          const recompressed = await recompressEmbeddedJpegBytes(
            obj.contents,
            imageScale,
            imageQuality
          );
          if (recompressed && recompressed.bytes.byteLength < obj.contents.byteLength) {
            (obj as unknown as { contents: Uint8Array }).contents = recompressed.bytes;
            dict.set(PDFName.of('Width'), PDFNumber.of(recompressed.width));
            dict.set(PDFName.of('Height'), PDFNumber.of(recompressed.height));
            dict.set(PDFName.of('Length'), PDFNumber.of(recompressed.bytes.byteLength));
          }
        }
      }
    }
  }

  return pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    objectsPerTick: 50,
  });
}

/**
 * Phase 1: Attempts content-preserving PDF optimization (selectable text, vectors, and layout preserved).
 * If the target size cannot be reached without rasterization, returns `needs_raster_confirmation`
 * so the user can explicitly decide whether to rasterize pages or keep the content-preserving PDF.
 */
export async function compressPdfPreserveContent(
  file: File,
  metadata: PdfMetadata,
  targetBytes: number,
  onProgress: (step: ProgressStep) => void,
  signal?: AbortSignal
): Promise<PdfInitialResult> {
  throwIfAborted(signal);
  onProgress('preparing');

  const originalBytes = file.size;

  // CASE C: Original PDF is already smaller than or equal to the requested target
  if (originalBytes <= targetBytes) {
    onProgress('checking');
    return {
      kind: 'completed',
      outcome: {
        status: 'already_smaller',
        statusHeading: 'Original file is already below the target size.',
        explanation: `Your PDF (${formatBytes(originalBytes)}) is already smaller than or equal to the requested target of ${formatBytes(targetBytes)}. We kept your original document untouched so all selectable text and vector content remain intact.`,
        outputBlob: file,
        outputBytes: originalBytes,
        outputFileName: generateCompressedFilename(file.name, 'application/pdf'),
        outputMimeType: 'application/pdf',
        originalBytes,
        originalFileName: file.name,
        requestedTargetBytes: targetBytes,
        bytesSaved: 0,
        percentageSaved: 0,
        wasRasterized: false,
        iterationsRun: 0,
      },
    };
  }

  const sourceBuffer = await file.arrayBuffer();
  throwIfAborted(signal);
  onProgress('compressing');

  let bestBytes: Uint8Array | null = null;
  let iterationsRun = 0;

  // Pass 1: Structural optimization & metadata cleanup + gentle embedded JPEG optimization
  const passSettings = [
    { scale: 1.0, quality: 0.78, recompressImages: true },
    { scale: 0.8, quality: 0.55, recompressImages: true },
    { scale: 0.6, quality: 0.35, recompressImages: true },
  ];

  for (const pass of passSettings) {
    throwIfAborted(signal);
    const candidateBytes = await runContentPreservingPass(
      sourceBuffer,
      pass.scale,
      pass.quality,
      pass.recompressImages,
      signal
    );
    iterationsRun++;

    if (!bestBytes || candidateBytes.byteLength < bestBytes.byteLength) {
      bestBytes = candidateBytes;
    }

    if (candidateBytes.byteLength <= targetBytes) {
      break;
    }
  }

  throwIfAborted(signal);
  onProgress('checking');

  const finalPreservedBytes =
    bestBytes && bestBytes.byteLength < originalBytes
      ? bestBytes
      : new Uint8Array(sourceBuffer);

  const preservedBlob = new Blob([finalPreservedBytes], { type: 'application/pdf' });

  // CASE A: Content-preserving optimization reached the target size!
  if (preservedBlob.size <= targetBytes) {
    const stats = calculateCompressionStats(originalBytes, preservedBlob.size);
    return {
      kind: 'completed',
      outcome: {
        status: 'target_reached',
        statusHeading: 'Target size reached.',
        explanation: `Compressed to ${formatBytes(preservedBlob.size)} (target: ${formatBytes(targetBytes)}) while preserving selectable text, vector graphics, and page layout.`,
        outputBlob: preservedBlob,
        outputBytes: preservedBlob.size,
        outputFileName: generateCompressedFilename(file.name, 'application/pdf'),
        outputMimeType: 'application/pdf',
        originalBytes,
        originalFileName: file.name,
        requestedTargetBytes: targetBytes,
        bytesSaved: stats.bytesSaved,
        percentageSaved: stats.percentageSaved,
        wasRasterized: false,
        iterationsRun,
      },
    };
  }

  // Content-preserving optimization could not reach targetBytes.
  // Do NOT silently rasterize. Ask for explicit user confirmation first.
  return {
    kind: 'needs_raster_confirmation',
    pending: {
      preservedBlob,
      preservedBytes: preservedBlob.size,
      requestedTargetBytes: targetBytes,
      pageCount: metadata.pageCount,
      originalBytes,
      originalFileName: file.name,
    },
  };
}

/**
 * Builds an outcome directly from the content-preserving result when the user declines rasterization.
 */
export function buildPreservedPdfOutcome(pending: PendingPdfRasterState): CompressionOutcome {
  if (pending.preservedBytes >= pending.originalBytes) {
    return {
      status: 'no_reduction_possible',
      statusHeading: 'Target size could not be reached without page rasterization.',
      explanation: `Content-preserving optimization could not reduce this PDF further while keeping selectable text and vector graphics intact. The original document (${formatBytes(pending.originalBytes)}) has been preserved.`,
      outputBlob: pending.preservedBlob,
      outputBytes: pending.originalBytes,
      outputFileName: generateCompressedFilename(pending.originalFileName, 'application/pdf'),
      outputMimeType: 'application/pdf',
      originalBytes: pending.originalBytes,
      originalFileName: pending.originalFileName,
      requestedTargetBytes: pending.requestedTargetBytes,
      bytesSaved: 0,
      percentageSaved: 0,
      wasRasterized: false,
      iterationsRun: 3,
    };
  }

  const stats = calculateCompressionStats(pending.originalBytes, pending.preservedBytes);
  return {
    status: 'closest_possible',
    statusHeading: 'Target size could not be reached. Here is the closest result we could produce.',
    explanation: `Reduced to ${formatBytes(pending.preservedBytes)} (requested target: ${formatBytes(pending.requestedTargetBytes)}) while preserving all selectable text and vector graphics.`,
    outputBlob: pending.preservedBlob,
    outputBytes: pending.preservedBytes,
    outputFileName: generateCompressedFilename(pending.originalFileName, 'application/pdf'),
    outputMimeType: 'application/pdf',
    originalBytes: pending.originalBytes,
    originalFileName: pending.originalFileName,
    requestedTargetBytes: pending.requestedTargetBytes,
    bytesSaved: stats.bytesSaved,
    percentageSaved: stats.percentageSaved,
    wasRasterized: false,
    iterationsRun: 3,
  };
}

/**
 * Renders every page of a PDF document at `renderScale` and `jpegQuality` and rebuilds a new PDF
 * preserving original page order, dimensions, aspect ratio, and orientation.
 */
async function renderRasterizedPdfPass(
  pdfJsDoc: pdfjsLib.PDFDocumentProxy,
  renderScale: number,
  jpegQuality: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const outPdf = await PDFDocument.create();
  const numPages = pdfJsDoc.numPages;

  for (let pageIndex = 1; pageIndex <= numPages; pageIndex++) {
    throwIfAborted(signal);
    const page = await pdfJsDoc.getPage(pageIndex);
    const baseViewport = page.getViewport({ scale: 1.0 });
    const renderViewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(renderViewport.width));
    canvas.height = Math.max(1, Math.round(renderViewport.height));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for PDF page rendering.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: renderViewport,
      canvas,
    }).promise;

    const pageBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', jpegQuality)
    );

    canvas.width = 0;
    canvas.height = 0;

    if (!pageBlob) {
      throw new Error(`Failed to encode rendered page ${pageIndex}.`);
    }

    const pageImageBytes = await pageBlob.arrayBuffer();
    const embeddedJpg = await outPdf.embedJpg(pageImageBytes);

    // Preserve exact original page dimensions and orientation in PDF points
    const newPage = outPdf.addPage([baseViewport.width, baseViewport.height]);
    newPage.drawImage(embeddedJpg, {
      x: 0,
      y: 0,
      width: baseViewport.width,
      height: baseViewport.height,
    });
  }

  return outPdf.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
}

/**
 * Phase 2: Performs explicitly confirmed page rasterization to achieve aggressive PDF size reduction.
 */
export async function compressPdfWithRasterization(
  file: File,
  pending: PendingPdfRasterState,
  onProgress: (step: ProgressStep) => void,
  signal?: AbortSignal
): Promise<CompressionOutcome> {
  throwIfAborted(signal);
  onProgress('preparing');

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfJsDoc = await loadingTask.promise;

  try {
    throwIfAborted(signal);
    onProgress('compressing');

    const targetBytes = pending.requestedTargetBytes;
    const bytesPerPageBudget = targetBytes / Math.max(1, pending.pageCount);

    // Determine ordered candidate passes (scale, jpegQuality) tailored to the per-page byte budget
    // Never drop below scale 0.65 (~47 DPI) so pages remain legible
    const candidatePasses: Array<{ scale: number; quality: number }> =
      bytesPerPageBudget >= 120 * 1024
        ? [
            { scale: 1.5, quality: 0.76 },
            { scale: 1.25, quality: 0.62 },
            { scale: 1.0, quality: 0.5 },
            { scale: 0.8, quality: 0.4 },
          ]
        : bytesPerPageBudget >= 45 * 1024
          ? [
              { scale: 1.2, quality: 0.65 },
              { scale: 1.0, quality: 0.52 },
              { scale: 0.85, quality: 0.42 },
              { scale: 0.7, quality: 0.34 },
            ]
          : [
              { scale: 1.0, quality: 0.52 },
              { scale: 0.85, quality: 0.42 },
              { scale: 0.72, quality: 0.32 },
              { scale: 0.65, quality: 0.25 },
            ];

    let bestUnderTarget: Uint8Array | null = null;
    let smallestRasterBytes: Uint8Array | null = null;
    let iterationsRun = 0;

    for (const pass of candidatePasses) {
      throwIfAborted(signal);
      const renderedPdfBytes = await renderRasterizedPdfPass(
        pdfJsDoc,
        pass.scale,
        pass.quality,
        signal
      );
      iterationsRun++;

      if (!smallestRasterBytes || renderedPdfBytes.byteLength < smallestRasterBytes.byteLength) {
        smallestRasterBytes = renderedPdfBytes;
      }

      if (renderedPdfBytes.byteLength <= targetBytes) {
        bestUnderTarget = renderedPdfBytes;
        break;
      }
    }

    throwIfAborted(signal);
    onProgress('checking');

    const chosenRaster = bestUnderTarget || smallestRasterBytes;
    if (!chosenRaster) {
      throw new Error('Failed to generate rasterized PDF.');
    }

    // Compare rasterized output against the content-preserving result:
    // If rasterization actually produced a larger file than content-preserving, use the smaller one!
    if (
      chosenRaster.byteLength >= pending.preservedBytes &&
      pending.preservedBytes < pending.originalBytes
    ) {
      return buildPreservedPdfOutcome(pending);
    }

    // CASE D: Even after rasterization, output is >= original file size
    if (chosenRaster.byteLength >= pending.originalBytes) {
      return {
        status: 'no_reduction_possible',
        statusHeading: 'Meaningful size reduction was not possible.',
        explanation:
          'This PDF contains very compact vector or text streams that are already smaller than a rasterized page representation. We kept your original text-preserving PDF.',
        outputBlob: pending.preservedBlob,
        outputBytes: pending.preservedBytes,
        outputFileName: generateCompressedFilename(pending.originalFileName, 'application/pdf'),
        outputMimeType: 'application/pdf',
        originalBytes: pending.originalBytes,
        originalFileName: pending.originalFileName,
        requestedTargetBytes: targetBytes,
        bytesSaved: Math.max(0, pending.originalBytes - pending.preservedBytes),
        percentageSaved: Math.max(
          0,
          ((pending.originalBytes - pending.preservedBytes) / pending.originalBytes) * 100
        ),
        wasRasterized: false,
        iterationsRun,
      };
    }

    const rasterBlob = new Blob([chosenRaster], { type: 'application/pdf' });
    const stats = calculateCompressionStats(pending.originalBytes, rasterBlob.size);

    // CASE A: Target reached via confirmed rasterization
    if (rasterBlob.size <= targetBytes) {
      return {
        status: 'target_reached',
        statusHeading: 'Target size reached.',
        explanation: `Compressed to ${formatBytes(rasterBlob.size)} (target: ${formatBytes(targetBytes)}) using user-confirmed page rasterization. Page dimensions and order were preserved.`,
        outputBlob: rasterBlob,
        outputBytes: rasterBlob.size,
        outputFileName: generateCompressedFilename(pending.originalFileName, 'application/pdf'),
        outputMimeType: 'application/pdf',
        originalBytes: pending.originalBytes,
        originalFileName: pending.originalFileName,
        requestedTargetBytes: targetBytes,
        bytesSaved: stats.bytesSaved,
        percentageSaved: stats.percentageSaved,
        wasRasterized: true,
        iterationsRun,
      };
    }

    // CASE B: Target not achievable even at minimum readable rasterization floor
    return {
      status: 'closest_possible',
      statusHeading:
        'Target size could not be reached. Here is the closest result we could produce.',
      explanation: `Requested target was ${formatBytes(targetBytes)} across ${pending.pageCount} ${pending.pageCount === 1 ? 'page' : 'pages'}. To preserve minimum legibility, the smallest valid PDF produced is ${formatBytes(rasterBlob.size)}.`,
      outputBlob: rasterBlob,
      outputBytes: rasterBlob.size,
      outputFileName: generateCompressedFilename(pending.originalFileName, 'application/pdf'),
      outputMimeType: 'application/pdf',
      originalBytes: pending.originalBytes,
      originalFileName: pending.originalFileName,
      requestedTargetBytes: targetBytes,
      bytesSaved: stats.bytesSaved,
      percentageSaved: stats.percentageSaved,
      wasRasterized: true,
      iterationsRun,
    };
  } finally {
    await pdfJsDoc.destroy();
  }
}
