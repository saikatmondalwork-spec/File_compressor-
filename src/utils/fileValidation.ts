import { PDFDocument } from 'pdf-lib';
import { CompressionMode, PdfMetadata, PhotoMetadata } from '../types/compression';

const ALLOWED_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Reads the first N bytes of a File to verify its binary signature (magic bytes).
 */
async function readHeaderBytes(file: File, length = 16): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Checks whether the binary header matches JPEG, PNG, or WebP signatures.
 */
function detectImageSignature(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length < 4) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Checks whether the binary header contains "%PDF-" within the first 1024 bytes.
 */
async function hasValidPdfSignature(file: File): Promise<boolean> {
  const bytes = await readHeaderBytes(file, 1024);
  if (bytes.length < 5) return false;
  const headerText = new TextDecoder('ascii').decode(bytes);
  return headerText.includes('%PDF-');
}

/**
 * Samples an image on a small canvas to check if any pixel has alpha < 255.
 */
function checkImageTransparency(img: HTMLImageElement, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return false;
  }
  try {
    const sampleWidth = Math.min(img.naturalWidth || img.width, 256);
    const sampleHeight = Math.min(img.naturalHeight || img.height, 256);
    if (sampleWidth <= 0 || sampleHeight <= 0) return false;

    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
    const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;

    for (let i = 3; i < imageData.length; i += 4) {
      if (imageData[i] < 250) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validates and inspects a selected photo file.
 */
export async function validateAndInspectPhoto(file: File): Promise<PhotoMetadata> {
  if (!file || file.size === 0) {
    throw new Error('The selected file is empty. Please choose a valid JPEG, PNG, or WebP photo.');
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_PHOTO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime = file.type ? ALLOWED_PHOTO_MIMES.includes(file.type.toLowerCase()) : true;

  if (!hasAllowedExtension && !hasAllowedMime) {
    throw new Error(
      `Unsupported file format "${file.name}". Please upload a JPEG, JPG, PNG, or WebP image.`
    );
  }

  const headerBytes = await readHeaderBytes(file, 16);
  const detectedMime = detectImageSignature(headerBytes);

  if (!detectedMime) {
    throw new Error(
      `The file "${file.name}" is not a valid JPEG, PNG, or WebP photo. Please check the file and try again.`
    );
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error('Browser could not decode this image. The file may be corrupted.'));
      element.src = previewUrl;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (width <= 0 || height <= 0) {
      throw new Error('Invalid image dimensions detected.');
    }

    const hasTransparency = checkImageTransparency(img, detectedMime);

    return {
      kind: 'photo',
      width,
      height,
      hasTransparency,
      mimeType: detectedMime,
      previewUrl,
    };
  } catch (err) {
    URL.revokeObjectURL(previewUrl);
    throw err instanceof Error
      ? err
      : new Error('Could not decode the selected photo. Please try another file.');
  }
}

/**
 * Validates and inspects a selected PDF file.
 */
export async function validateAndInspectPdf(file: File): Promise<PdfMetadata> {
  if (!file || file.size === 0) {
    throw new Error('The selected PDF file is empty. Please choose a valid PDF document.');
  }

  const lowerName = file.name.toLowerCase();
  const hasPdfExt = lowerName.endsWith('.pdf');
  const hasPdfMime = !file.type || file.type === 'application/pdf' || file.type.includes('pdf');

  if (!hasPdfExt && !hasPdfMime) {
    throw new Error(`Unsupported file format "${file.name}". Only PDF (.pdf) files are accepted here.`);
  }

  const isPdfSignature = await hasValidPdfSignature(file);
  if (!isPdfSignature) {
    throw new Error(
      `The file "${file.name}" does not contain a valid PDF header. It may be corrupted or renamed from another format.`
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, {
      updateMetadata: false,
    });

    const pageCount = pdfDoc.getPageCount();
    if (pageCount <= 0) {
      throw new Error('This PDF contains no pages.');
    }

    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();

    return {
      kind: 'pdf',
      pageCount,
      pageWidthPt: Math.round(width),
      pageHeightPt: Math.round(height),
      isEncrypted: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('encrypted') || message.toLowerCase().includes('password')) {
      throw new Error(
        'This PDF is encrypted or password-protected. Please remove the password protection before compressing.'
      );
    }
    throw new Error(
      'Unable to read this PDF document. The file may be damaged, encrypted, or use an unsupported structure.'
    );
  }
}

/**
 * Validates a file according to the active mode.
 */
export async function validateAndInspectFile(
  file: File,
  mode: CompressionMode
): Promise<PhotoMetadata | PdfMetadata> {
  if (mode === 'photo') {
    return validateAndInspectPhoto(file);
  }
  return validateAndInspectPdf(file);
}
