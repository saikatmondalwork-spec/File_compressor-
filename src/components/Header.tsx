import { FileSpreadsheet } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-20 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
            File compressor
          </span>
        </div>

        <div className="shrink-0 text-right">
          <span className="text-xs font-medium text-slate-600 sm:text-sm whitespace-nowrap">
            Welcome Back Sugata
          </span>
        </div>
      </div>
    </header>
  );
}
