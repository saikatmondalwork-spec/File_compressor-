import { FileText, Image as ImageIcon } from 'lucide-react';
import { CompressionMode } from '../types/compression';

interface CompressionTabsProps {
  activeMode: CompressionMode;
  onSelectMode: (mode: CompressionMode) => void;
  disabled?: boolean;
}

export function CompressionTabs({
  activeMode,
  onSelectMode,
  disabled = false,
}: CompressionTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Compression file type"
      className="inline-flex w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-100/90 p-1"
    >
      <button
        type="button"
        role="tab"
        id="tab-photo"
        aria-selected={activeMode === 'photo'}
        aria-controls="panel-compressor"
        disabled={disabled}
        onClick={() => onSelectMode('photo')}
        className={`flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-150 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
          activeMode === 'photo'
            ? 'bg-white text-slate-900 shadow-xs'
            : 'text-slate-600 hover:text-slate-900'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <ImageIcon
          className={`h-4 w-4 shrink-0 ${
            activeMode === 'photo' ? 'text-sky-600' : 'text-slate-500'
          }`}
          aria-hidden="true"
        />
        <span>Photo</span>
      </button>

      <button
        type="button"
        role="tab"
        id="tab-pdf"
        aria-selected={activeMode === 'pdf'}
        aria-controls="panel-compressor"
        disabled={disabled}
        onClick={() => onSelectMode('pdf')}
        className={`flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-150 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
          activeMode === 'pdf'
            ? 'bg-white text-slate-900 shadow-xs'
            : 'text-slate-600 hover:text-slate-900'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <FileText
          className={`h-4 w-4 shrink-0 ${
            activeMode === 'pdf' ? 'text-sky-600' : 'text-slate-500'
          }`}
          aria-hidden="true"
        />
        <span>PDF</span>
      </button>
    </div>
  );
}
