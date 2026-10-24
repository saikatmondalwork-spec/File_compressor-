import { CheckCircle2, Download, Info, RotateCcw } from 'lucide-react';
import { CompressionOutcome } from '../types/compression';
import { formatBytes } from '../utils/units';

interface CompressionResultProps {
  outcome: CompressionOutcome;
  onReset: () => void;
}

export function CompressionResult({ outcome, onReset }: CompressionResultProps) {
  const handleDownload = () => {
    const url = URL.createObjectURL(outcome.outputBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = outcome.outputFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke object URL after triggering browser download
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1500);
  };

  const isTargetReached = outcome.status === 'target_reached';
  const hasPositiveSavings = outcome.bytesSaved > 0;
  const formattedPct =
    outcome.percentageSaved >= 0
      ? `${outcome.percentageSaved.toFixed(1)}%`
      : `${outcome.percentageSaved.toFixed(1)}% (larger)`;

  return (
    <section
      aria-labelledby="compression-result-heading"
      className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs"
    >
      {/* Status Banner */}
      <div
        className={`flex items-start gap-3 rounded-lg border p-3.5 ${
          isTargetReached
            ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
            : 'border-sky-200 bg-sky-50/70 text-slate-900'
        }`}
      >
        {isTargetReached ? (
          <CheckCircle2
            className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5"
            aria-hidden="true"
          />
        ) : (
          <Info className="h-5 w-5 shrink-0 text-sky-600 mt-0.5" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <h3 id="compression-result-heading" className="text-sm font-semibold">
            {outcome.statusHeading}
          </h3>
          <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
            {outcome.explanation}
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
          <span className="block text-xs text-slate-500">Original file name</span>
          <span
            className="mt-1 block truncate text-sm font-semibold text-slate-900"
            title={outcome.originalFileName}
          >
            {outcome.originalFileName}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
          <span className="block text-xs text-slate-500">Original file size</span>
          <span className="mt-1 block font-mono text-sm font-semibold text-slate-900 tabular-nums">
            {formatBytes(outcome.originalBytes)}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
          <span className="block text-xs text-slate-500">Compressed file size</span>
          <span className="mt-1 block font-mono text-sm font-semibold text-sky-700 tabular-nums">
            {formatBytes(outcome.outputBytes)}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
          <span className="block text-xs text-slate-500">Requested target size</span>
          <span className="mt-1 block font-mono text-sm font-semibold text-slate-900 tabular-nums">
            {formatBytes(outcome.requestedTargetBytes)}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
          <span className="block text-xs text-slate-500">Actual size reduction</span>
          <span
            className={`mt-1 block font-mono text-sm font-semibold tabular-nums ${
              hasPositiveSavings ? 'text-emerald-700' : 'text-slate-700'
            }`}
          >
            {hasPositiveSavings ? `-${formatBytes(outcome.bytesSaved)}` : '0 B (no reduction)'}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
          <span className="block text-xs text-slate-500">Percentage saved</span>
          <span
            className={`mt-1 block font-mono text-sm font-semibold tabular-nums ${
              hasPositiveSavings ? 'text-emerald-700' : 'text-slate-700'
            }`}
          >
            {hasPositiveSavings ? formattedPct : '0.0%'}
          </span>
        </div>
      </div>

      {/* Output format & resolution metadata line */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
        <span>Output file: {outcome.outputFileName}</span>
        {outcome.outputWidth && outcome.outputHeight && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              Resolution: {outcome.outputWidth} × {outcome.outputHeight} px
            </span>
          </>
        )}
        {typeof outcome.wasRasterized === 'boolean' && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              Mode: {outcome.wasRasterized ? 'Rasterized pages' : 'Text & vector preserved'}
            </span>
          </>
        )}
      </div>

      {/* Primary Download & Compress Another Actions */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap cursor-pointer"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Download compressed file</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap cursor-pointer"
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Compress another file</span>
        </button>
      </div>
    </section>
  );
}
