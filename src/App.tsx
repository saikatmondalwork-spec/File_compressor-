import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Header } from './components/Header';
import { CompressionTabs } from './components/CompressionTabs';
import { FileUpload } from './components/FileUpload';
import { TargetSizeControl } from './components/TargetSizeControl';
import { CompressionProgress } from './components/CompressionProgress';
import { PdfRasterizationConfirmation } from './components/PdfRasterizationConfirmation';
import { CompressionResult } from './components/CompressionResult';
import { ErrorMessage } from './components/ErrorMessage';
import {
  CompressionMode,
  CompressionOutcome,
  PendingPdfRasterState,
  ProgressStep,
  SelectedFileState,
  TargetSizeConfig,
} from './types/compression';
import { validateAndInspectFile } from './utils/fileValidation';
import { calculateInitialTargetConfig } from './utils/units';
import { compressPhotoToTarget } from './utils/imageCompression';
import {
  buildPreservedPdfOutcome,
  compressPdfPreserveContent,
  compressPdfWithRasterization,
} from './utils/pdfCompression';

interface SectionWorkspaceState {
  selectedFile: SelectedFileState | null;
  targetConfig: TargetSizeConfig | null;
  progressStep: ProgressStep;
  outcome: CompressionOutcome | null;
  pendingPdfRaster: PendingPdfRasterState | null;
  errorMessage: string | null;
}

const INITIAL_SECTION_STATE: SectionWorkspaceState = {
  selectedFile: null,
  targetConfig: null,
  progressStep: 'idle',
  outcome: null,
  pendingPdfRaster: null,
  errorMessage: null,
};

export default function App() {
  const [activeMode, setActiveMode] = useState<CompressionMode>('photo');
  const [workspaces, setWorkspaces] = useState<
    Record<CompressionMode, SectionWorkspaceState>
  >({
    photo: { ...INITIAL_SECTION_STATE },
    pdf: { ...INITIAL_SECTION_STATE },
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentWorkspace = workspaces[activeMode];

  const isProcessing =
    currentWorkspace.progressStep === 'preparing' ||
    currentWorkspace.progressStep === 'compressing' ||
    currentWorkspace.progressStep === 'checking';

  const updateWorkspace = (
    mode: CompressionMode,
    updater: (prev: SectionWorkspaceState) => SectionWorkspaceState
  ) => {
    setWorkspaces((prev) => ({
      ...prev,
      [mode]: updater(prev[mode]),
    }));
  };

  // Cleanup any created object URLs on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const revokePreviewIfPresent = (state: SelectedFileState | null) => {
    if (state?.metadata.kind === 'photo' && state.metadata.previewUrl) {
      URL.revokeObjectURL(state.metadata.previewUrl);
    }
  };

  const handleSelectMode = (mode: CompressionMode) => {
    if (isProcessing || mode === activeMode) return;
    setActiveMode(mode);
  };

  const handleFileSelect = async (file: File) => {
    const mode = activeMode;

    // Clear previous state and revoke old preview URL before validating new file
    revokePreviewIfPresent(workspaces[mode].selectedFile);

    updateWorkspace(mode, () => ({
      ...INITIAL_SECTION_STATE,
      progressStep: 'preparing',
    }));

    try {
      const metadata = await validateAndInspectFile(file, mode);
      const initialTarget = calculateInitialTargetConfig(file.size);

      updateWorkspace(mode, () => ({
        selectedFile: { file, metadata },
        targetConfig: {
          targetBytes: initialTarget.defaultTargetBytes,
          unit: initialTarget.defaultUnit,
          numericInput: initialTarget.numericInput,
          minSliderBytes: initialTarget.minSliderBytes,
          maxSliderBytes: initialTarget.maxSliderBytes,
        },
        progressStep: 'ready',
        outcome: null,
        pendingPdfRaster: null,
        errorMessage: null,
      }));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not read the selected file. Please verify the file format and try again.';

      updateWorkspace(mode, () => ({
        ...INITIAL_SECTION_STATE,
        progressStep: 'failed',
        errorMessage: msg,
      }));
    }
  };

  const handleRemoveFile = () => {
    if (isProcessing) return;
    const mode = activeMode;
    revokePreviewIfPresent(workspaces[mode].selectedFile);
    updateWorkspace(mode, () => ({ ...INITIAL_SECTION_STATE }));
  };

  const handleTargetConfigChange = (newConfig: TargetSizeConfig) => {
    const mode = activeMode;
    updateWorkspace(mode, (prev) => ({
      ...prev,
      targetConfig: newConfig,
      progressStep: 'ready',
      outcome: null,
      pendingPdfRaster: null,
      errorMessage: null,
    }));
  };

  const handleCancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    updateWorkspace(activeMode, (prev) => ({
      ...prev,
      progressStep: 'ready',
      errorMessage: null,
    }));
  };

  const handleStartCompression = async () => {
    const mode = activeMode;
    const { selectedFile, targetConfig } = workspaces[mode];
    if (!selectedFile || !targetConfig) return;

    if (targetConfig.targetBytes <= 0) {
      updateWorkspace(mode, (prev) => ({
        ...prev,
        errorMessage: 'Please enter a valid target output size greater than 0 KB.',
      }));
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    updateWorkspace(mode, (prev) => ({
      ...prev,
      progressStep: 'preparing',
      outcome: null,
      pendingPdfRaster: null,
      errorMessage: null,
    }));

    try {
      if (selectedFile.metadata.kind === 'photo') {
        const outcome = await compressPhotoToTarget(
          selectedFile.file,
          selectedFile.metadata,
          targetConfig.targetBytes,
          (step) => {
            updateWorkspace(mode, (prev) => ({ ...prev, progressStep: step }));
          },
          controller.signal
        );

        updateWorkspace(mode, (prev) => ({
          ...prev,
          progressStep: 'complete',
          outcome,
        }));
      } else {
        const result = await compressPdfPreserveContent(
          selectedFile.file,
          selectedFile.metadata,
          targetConfig.targetBytes,
          (step) => {
            updateWorkspace(mode, (prev) => ({ ...prev, progressStep: step }));
          },
          controller.signal
        );

        if (result.kind === 'completed') {
          updateWorkspace(mode, (prev) => ({
            ...prev,
            progressStep: 'complete',
            outcome: result.outcome,
          }));
        } else {
          updateWorkspace(mode, (prev) => ({
            ...prev,
            progressStep: 'awaiting_raster_confirmation',
            pendingPdfRaster: result.pending,
          }));
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        updateWorkspace(mode, (prev) => ({
          ...prev,
          progressStep: 'ready',
        }));
        return;
      }

      const msg =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while compressing your file.';

      updateWorkspace(mode, (prev) => ({
        ...prev,
        progressStep: 'failed',
        errorMessage: msg,
      }));
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleConfirmPdfRasterize = async () => {
    const mode = 'pdf';
    const { selectedFile, pendingPdfRaster } = workspaces[mode];
    if (!selectedFile || !pendingPdfRaster) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    updateWorkspace(mode, (prev) => ({
      ...prev,
      progressStep: 'preparing',
      pendingPdfRaster: null,
      errorMessage: null,
    }));

    try {
      const outcome = await compressPdfWithRasterization(
        selectedFile.file,
        pendingPdfRaster,
        (step) => {
          updateWorkspace(mode, (prev) => ({ ...prev, progressStep: step }));
        },
        controller.signal
      );

      updateWorkspace(mode, (prev) => ({
        ...prev,
        progressStep: 'complete',
        outcome,
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        updateWorkspace(mode, (prev) => ({
          ...prev,
          progressStep: 'ready',
        }));
        return;
      }

      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to rasterize and compress the PDF document.';

      updateWorkspace(mode, (prev) => ({
        ...prev,
        progressStep: 'failed',
        errorMessage: msg,
      }));
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleKeepPreservedPdf = () => {
    const mode = 'pdf';
    const { pendingPdfRaster } = workspaces[mode];
    if (!pendingPdfRaster) return;

    const outcome = buildPreservedPdfOutcome(pendingPdfRaster);
    updateWorkspace(mode, (prev) => ({
      ...prev,
      progressStep: 'complete',
      pendingPdfRaster: null,
      outcome,
    }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {/* Main Heading */}
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
            Compress your files to the size you need.
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Upload a photo or PDF document and set your exact target output size in KB or MB.
          </p>
        </div>

        {/* Primary Mode Selector Tabs */}
        <div className="mt-6 flex justify-center sm:justify-start">
          <CompressionTabs
            activeMode={activeMode}
            onSelectMode={handleSelectMode}
            disabled={isProcessing}
          />
        </div>

        {/* Active Compression Workspace */}
        <div
          id="panel-compressor"
          role="tabpanel"
          aria-labelledby={activeMode === 'photo' ? 'tab-photo' : 'tab-pdf'}
          className="mt-6 space-y-5 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-7 shadow-xs"
        >
          {/* Section Subheader */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {activeMode === 'photo' ? 'Photo Compressor' : 'PDF Compressor'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeMode === 'photo'
                  ? 'Iteratively adjusts encoding quality and resolution to match your target size.'
                  : 'Optimizes PDF structure and embedded images while protecting document readability.'}
              </p>
            </div>
          </div>

          {/* Error Banner */}
          <ErrorMessage
            message={currentWorkspace.errorMessage}
            onDismiss={() =>
              updateWorkspace(activeMode, (prev) => ({ ...prev, errorMessage: null }))
            }
          />

          {/* Step 2: File Upload Area */}
          <FileUpload
            mode={activeMode}
            selectedFile={currentWorkspace.selectedFile}
            onFileSelect={handleFileSelect}
            onRemoveFile={handleRemoveFile}
            disabled={isProcessing}
          />

          {/* Step 3: Target Output Size Control */}
          {currentWorkspace.selectedFile && currentWorkspace.targetConfig && (
            <TargetSizeControl
              originalBytes={currentWorkspace.selectedFile.file.size}
              config={currentWorkspace.targetConfig}
              onChange={handleTargetConfigChange}
              disabled={isProcessing}
            />
          )}

          {/* Step 4: Primary Action Button ("Compress file") */}
          {currentWorkspace.selectedFile &&
            currentWorkspace.targetConfig &&
            !isProcessing &&
            currentWorkspace.progressStep !== 'awaiting_raster_confirmation' && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                <span className="text-xs font-medium text-slate-500">
                  {currentWorkspace.outcome ? 'Compression complete' : 'Ready to compress'}
                </span>

                <button
                  type="button"
                  onClick={handleStartCompression}
                  disabled={currentWorkspace.targetConfig.targetBytes <= 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Compress file</span>
                </button>
              </div>
            )}

          {/* Step 5: Real Processing Progress */}
          {isProcessing && (
            <CompressionProgress
              step={currentWorkspace.progressStep}
              onCancel={handleCancelProcessing}
            />
          )}

          {/* Explicit PDF Rasterization Confirmation (when content-preserving pass cannot meet target) */}
          {currentWorkspace.progressStep === 'awaiting_raster_confirmation' &&
            currentWorkspace.pendingPdfRaster && (
              <PdfRasterizationConfirmation
                pending={currentWorkspace.pendingPdfRaster}
                onConfirmRasterize={handleConfirmPdfRasterize}
                onKeepPreserved={handleKeepPreservedPdf}
              />
            )}

          {/* Step 6: Compression Result Card */}
          {currentWorkspace.outcome && !isProcessing && (
            <CompressionResult
              outcome={currentWorkspace.outcome}
              onReset={handleRemoveFile}
            />
          )}
        </div>

        {/* Short, Accurate Local Privacy Statement */}
        <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <p>
            All photo and PDF compression happens locally in your browser. Your files remain on
            your device and are never uploaded to any external server.
          </p>
        </div>
      </main>
    </div>
  );
}
