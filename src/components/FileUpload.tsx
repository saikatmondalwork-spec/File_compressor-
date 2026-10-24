import React, { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react';
import { CompressionMode, SelectedFileState } from '../types/compression';
import { formatBytes } from '../utils/units';

interface FileUploadProps {
  mode: CompressionMode;
  selectedFile: SelectedFileState | null;
  onFileSelect: (file: File) => void;
  onRemoveFile: () => void;
  disabled?: boolean;
}

export function FileUpload({
  mode,
  selectedFile,
  onFileSelect,
  onRemoveFile,
  disabled = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptAttribute =
    mode === 'photo'
      ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
      : '.pdf,application/pdf';

  const handleOpenFileDialog = () => {
    if (disabled) return;
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttribute}
        onChange={handleInputChange}
        disabled={disabled}
        className="sr-only"
        aria-label={mode === 'photo' ? 'Upload a photo file' : 'Upload a PDF file'}
      />

      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleOpenFileDialog}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleOpenFileDialog();
            }
          }}
          aria-label={
            mode === 'photo'
              ? 'Drop a photo here or click to choose a photo file'
              : 'Drop a PDF here or click to choose a PDF file'
          }
          className={`group flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
            isDragging
              ? 'border-sky-500 bg-sky-50/70'
              : 'border-slate-300 bg-slate-50/60 hover:border-sky-400 hover:bg-slate-50'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-sky-600 shadow-xs border border-slate-200/80 group-hover:border-sky-200">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </div>

          <p className="text-base font-semibold text-slate-900">
            {mode === 'photo' ? 'Drop your photo here' : 'Drop your PDF file here'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'photo'
              ? 'Supports JPEG, JPG, PNG, and WebP formats'
              : 'Supports standard PDF (.pdf) documents'}
          </p>

          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFileDialog();
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap cursor-pointer"
          >
            Choose file
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5 min-w-0">
              {selectedFile.metadata.kind === 'photo' ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <img
                    src={selectedFile.metadata.previewUrl}
                    alt={selectedFile.file.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sky-600">
                  {mode === 'photo' ? (
                    <ImageIcon className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <FileText className="h-6 w-6" aria-hidden="true" />
                  )}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-semibold text-slate-900 sm:text-base"
                  title={selectedFile.file.name}
                >
                  {selectedFile.file.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 sm:text-sm tabular-nums">
                  <span className="font-mono font-medium text-slate-800">
                    {formatBytes(selectedFile.file.size)}
                  </span>
                  <span aria-hidden="true">·</span>
                  {selectedFile.metadata.kind === 'photo' ? (
                    <span>
                      {selectedFile.metadata.width} × {selectedFile.metadata.height} px
                      {selectedFile.metadata.hasTransparency ? ' · Transparent' : ''}
                    </span>
                  ) : (
                    <span>
                      {selectedFile.metadata.pageCount}{' '}
                      {selectedFile.metadata.pageCount === 1 ? 'page' : 'pages'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                disabled={disabled}
                onClick={handleOpenFileDialog}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Choose another</span>
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={onRemoveFile}
                aria-label="Remove selected file"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 hover:border-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
