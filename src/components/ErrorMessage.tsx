import { AlertCircle, X } from 'lucide-react';

interface ErrorMessageProps {
  message: string | null;
  onDismiss: () => void;
}

export function ErrorMessage({ message, onDismiss }: ErrorMessageProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-950"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertCircle
          className="h-5 w-5 shrink-0 text-rose-600 mt-0.5"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rose-900">Unable to process file</p>
          <p className="mt-0.5 text-xs sm:text-sm text-rose-800 leading-relaxed">
            {message}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error message"
        className="shrink-0 rounded-lg p-1 text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 cursor-pointer"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
