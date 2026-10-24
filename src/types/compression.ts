export type CompressionMode = 'photo' | 'pdf';

export type SizeUnit = 'KB' | 'MB';

export type ProgressStep =
  | 'idle'
  | 'ready'
  | 'preparing'
  | 'compressing'
  | 'checking'
  | 'awaiting_raster_confirmation'
  | 'complete'
  | 'failed';

export type OutcomeStatus =
  | 'target_reached'
  | 'closest_possible'
  | 'already_smaller'
  | 'no_reduction_possible';

export interface PhotoMetadata {
  kind: 'photo';
  width: number;
  height: number;
  hasTransparency: boolean;
  mimeType: string;
  previewUrl: string;
}

export interface PdfMetadata {
  kind: 'pdf';
  pageCount: number;
  pageWidthPt?: number;
  pageHeightPt?: number;
  isEncrypted?: boolean;
}

export type FileMetadata = PhotoMetadata | PdfMetadata;

export interface SelectedFileState {
  file: File;
  metadata: FileMetadata;
}

export interface TargetSizeConfig {
  targetBytes: number;
  unit: SizeUnit;
  numericInput: string;
  minSliderBytes: number;
  maxSliderBytes: number;
}

export interface CompressionOutcome {
  status: OutcomeStatus;
  statusHeading: string;
  explanation: string;
  outputBlob: Blob;
  outputBytes: number;
  outputFileName: string;
  outputMimeType: string;
  originalBytes: number;
  originalFileName: string;
  requestedTargetBytes: number;
  bytesSaved: number;
  percentageSaved: number;
  outputWidth?: number;
  outputHeight?: number;
  qualityUsed?: number;
  wasRasterized?: boolean;
  iterationsRun: number;
}

export interface PendingPdfRasterState {
  preservedBlob: Blob;
  preservedBytes: number;
  requestedTargetBytes: number;
  pageCount: number;
  originalBytes: number;
  originalFileName: string;
}
