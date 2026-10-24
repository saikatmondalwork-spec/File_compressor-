import { AlertTriangle, Check, FileText } from 'lucide-react';
import { PendingPdfRasterState } from '../types/compression';
import { formatBytes } from '../utils/units';

interface PdfRasterizationConfirmationProps {
  pending: PendingPdfRasterState;
  onConfirmRasterize: () => void;
  onKeepPreserved: () => void;
}

export function PdfRasterizationConfirmation({
  pending,
  onConfirmRasterize,
  onKeepPreserved,
}: PdfRasterizationConfirmationProps) {
  const perPageTargetBytes = pending.requestedTargetBytes / Math.max(1, pending.pageCount);
  const isVerySmallPerPage = perPageTargetBytes < 45 * 1024;
  const didPreservedReduce = pending.preservedBytes < pending.originalBytes;

  return (
    <div
      role="region"
      aria-labelledby="raster-confirm-title"
      className="rounded-xl border border-amber-300 bg-amber-50/60 p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 id="raster-confirm-title" className="text-base font-semibold text-slate-900">
            Aggressive PDF compression requires page rasterization
          </h3>

          <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">
            Content-preserving optimization{' '}
            {didPreservedReduce
              ? `reduced your PDF from ${formatBytes(pending.originalBytes)} to ${formatBytes(pending.preservedBytes)}`
              : `kept your PDF at ${formatBytes(pending.originalBytes)}`}{' '}
            while keeping all selectable text and vector graphics intact, which is still above your{' '}
            <span className="font-mono font-semibold text-slate-900">
              {formatBytes(pending.requestedTargetBytes)}
            </span>{' '}
            target.
          </p>

          <div className="mt-3 rounded-lg border border-amber-200/90 bg-white/90 p-3.5 text-xs text-slate-700 space-y-1.5">
            <p className="font-semibold text-slate-900">
              What happens if you choose page rasterization:
            </p>
            <p>
              • Every page ({pending.pageCount} {pending.pageCount === 1 ? 'page' : 'pages'}) will
              be rendered as an optimized image and rebuilt into a new PDF with matching page
              dimensions and orientation.
            </p>
            <p>
              • <strong className="font-semibold text-slate-900">Trade-off:</strong> Selectable
              text, text searchability, and vector sharpness will be removed.
            </p>
            {isVerySmallPerPage && (
              <p className="text-amber-800 font-medium pt-1">
                • Legibility warning: Your requested target allows roughly{' '}
                {formatBytes(perPageTargetBytes)} per page, which may noticeably reduce text
                sharpness and readability.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onConfirmRasterize}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap cursor-pointer"
            >
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Confirm &amp; rasterize PDF</span>
            </button>

            <button
              type="button"
              onClick={onKeepPreserved}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap cursor-pointer"
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              <span>
                Keep text-preserving result ({formatBytes(pending.preservedBytes)})
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
