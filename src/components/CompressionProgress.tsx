import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { ProgressStep } from '../types/compression';

interface CompressionProgressProps {
  step: ProgressStep;
  onCancel: () => void;
}

const STEP_LABELS: Record<ProgressStep, string> = {
  idle: 'Ready to compress',
  ready: 'Ready to compress',
  preparing: 'Preparing file',
  compressing: 'Compressing',
  checking: 'Checking output size',
  awaiting_raster_confirmation: 'Awaiting your confirmation',
  complete: 'Compression complete',
  failed: 'Compression incomplete or failed',
};

export function CompressionProgress({ step, onCancel }: CompressionProgressProps) {
  if (step === 'idle' || step === 'ready') {
    return null;
  }

  const isRunning = step === 'preparing' || step === 'compressing' || step === 'checking';
  const label = STEP_LABELS[step] || 'Processing';

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {isRunning && (
            <Loader2
              className="h-5 w-5 shrink-0 animate-spin text-sky-600"
              aria-hidden="true"
            />
          )}
          {step === 'complete' && (
            <CheckCircle2
              className="h-5 w-5 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
          )}
          {step === 'failed' && (
            <XCircle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          )}

          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            {isRunning && (
              <p className="mt-0.5 text-xs text-slate-500">
                Optimizing parameters locally in your browser to approach your target size...
              </p>
            )}
          </div>
        </div>

        {isRunning && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
