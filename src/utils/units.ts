import { SizeUnit } from '../types/compression';

export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = 1024 * 1024;

/**
 * Converts bytes into KB or MB numerical value.
 */
export function bytesToUnitValue(bytes: number, unit: SizeUnit): number {
  if (unit === 'MB') {
    return bytes / BYTES_PER_MB;
  }
  return bytes / BYTES_PER_KB;
}

/**
 * Formats a numeric value in KB or MB for clean display inside the numerical input.
 */
export function formatNumericInput(bytes: number, unit: SizeUnit): string {
  if (bytes <= 0) return '0';
  if (unit === 'MB') {
    const mb = bytes / BYTES_PER_MB;
    if (mb >= 10) return mb.toFixed(1).replace(/\.0$/, '');
    return mb.toFixed(2).replace(/\.?0+$/, '');
  }
  const kb = bytes / BYTES_PER_KB;
  if (kb >= 10) return Math.round(kb).toString();
  return kb.toFixed(1).replace(/\.0$/, '');
}

/**
 * Converts a user-entered numerical value and unit into exact bytes.
 */
export function unitValueToBytes(value: number, unit: SizeUnit): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const multiplier = unit === 'MB' ? BYTES_PER_MB : BYTES_PER_KB;
  return Math.round(value * multiplier);
}

/**
 * Formats a byte count into a human-readable string using 1 KB = 1024 B and 1 MB = 1024 KB.
 */
export function formatBytes(bytes: number): string {
  const absBytes = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';

  if (absBytes < BYTES_PER_KB) {
    return `${sign}${Math.round(absBytes)} B`;
  }
  if (absBytes < BYTES_PER_MB) {
    const kb = absBytes / BYTES_PER_KB;
    return `${sign}${kb >= 100 ? Math.round(kb) : Number(kb.toFixed(1))} KB`;
  }
  const mb = absBytes / BYTES_PER_MB;
  return `${sign}${Number(mb.toFixed(2))} MB`;
}

/**
 * Calculates default target size and slider range for a newly selected file.
 */
export function calculateInitialTargetConfig(originalBytes: number): {
  defaultTargetBytes: number;
  defaultUnit: SizeUnit;
  minSliderBytes: number;
  maxSliderBytes: number;
  numericInput: string;
} {
  // Choose MB as default unit if the original file is >= 1.5 MB, otherwise KB
  const defaultUnit: SizeUnit = originalBytes >= 1.5 * BYTES_PER_MB ? 'MB' : 'KB';

  // Slider minimum: 2% of original file size, or at least 1 KB (clamped to originalBytes if file < 1 KB)
  const minSliderBytes = Math.min(
    originalBytes,
    Math.max(BYTES_PER_KB, Math.round(originalBytes * 0.02))
  );

  const maxSliderBytes = Math.max(minSliderBytes, originalBytes);

  // Default target is ~50% of the original size, rounded cleanly in the selected unit
  const rawDefault = Math.max(minSliderBytes, Math.round(originalBytes * 0.5));
  let defaultTargetBytes = rawDefault;

  if (defaultUnit === 'KB') {
    const roundedKb = Math.max(1, Math.round(rawDefault / BYTES_PER_KB));
    defaultTargetBytes = Math.min(maxSliderBytes, roundedKb * BYTES_PER_KB);
  } else {
    const roundedMb = Math.max(0.05, Math.round((rawDefault / BYTES_PER_MB) * 20) / 20);
    defaultTargetBytes = Math.min(maxSliderBytes, Math.round(roundedMb * BYTES_PER_MB));
  }

  return {
    defaultTargetBytes,
    defaultUnit,
    minSliderBytes,
    maxSliderBytes,
    numericInput: formatNumericInput(defaultTargetBytes, defaultUnit),
  };
}

/**
 * Calculates exact compression savings and percentage reduction.
 * Percentage saved = ((Original size - Compressed size) / Original size) * 100
 */
export function calculateCompressionStats(originalBytes: number, compressedBytes: number): {
  bytesSaved: number;
  percentageSaved: number;
} {
  if (originalBytes <= 0) {
    return { bytesSaved: 0, percentageSaved: 0 };
  }
  const bytesSaved = originalBytes - compressedBytes;
  const percentageSaved = ((originalBytes - compressedBytes) / originalBytes) * 100;
  return {
    bytesSaved,
    percentageSaved,
  };
}

/**
 * Generates an accurate output filename matching the generated MIME type.
 */
export function generateCompressedFilename(originalName: string, outputMimeType: string): string {
  const lastDotIndex = originalName.lastIndexOf('.');
  const baseName =
    lastDotIndex > 0 ? originalName.slice(0, lastDotIndex) : originalName || 'file';
  const sanitizedBase = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');

  let ext = 'bin';
  switch (outputMimeType) {
    case 'image/jpeg':
      ext = 'jpg';
      break;
    case 'image/png':
      ext = 'png';
      break;
    case 'image/webp':
      ext = 'webp';
      break;
    case 'application/pdf':
      ext = 'pdf';
      break;
    default:
      ext = lastDotIndex > 0 ? originalName.slice(lastDotIndex + 1).toLowerCase() : 'out';
  }

  return `${sanitizedBase}_compressed.${ext}`;
}
