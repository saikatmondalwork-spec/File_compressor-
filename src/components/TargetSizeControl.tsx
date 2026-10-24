import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { SizeUnit, TargetSizeConfig } from '../types/compression';
import {
  BYTES_PER_KB,
  BYTES_PER_MB,
  formatBytes,
  formatNumericInput,
  unitValueToBytes,
} from '../utils/units';

interface TargetSizeControlProps {
  originalBytes: number;
  config: TargetSizeConfig;
  onChange: (newConfig: TargetSizeConfig) => void;
  disabled?: boolean;
}

export function TargetSizeControl({
  originalBytes,
  config,
  onChange,
  disabled = false,
}: TargetSizeControlProps) {
  const { targetBytes, unit, numericInput, minSliderBytes, maxSliderBytes } = config;

  // Slider thumb position clamped purely for visual track rendering;
  // never silently clamps the actual requested `targetBytes`.
  const clampedSliderBytes = Math.min(
    maxSliderBytes,
    Math.max(minSliderBytes, targetBytes || minSliderBytes)
  );

  const sliderSpan = Math.max(1, maxSliderBytes - minSliderBytes);
  const sliderPercentage = Math.round(
    ((clampedSliderBytes - minSliderBytes) / sliderSpan) * 100
  );

  const ratioOfOriginal =
    originalBytes > 0 ? Math.round((targetBytes / originalBytes) * 100) : 0;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBytes = Number(e.target.value);
    onChange({
      ...config,
      targetBytes: newBytes,
      numericInput: formatNumericInput(newBytes, unit),
    });
  };

  const handleNumericInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue === '') {
      onChange({
        ...config,
        numericInput: '',
        targetBytes: 0,
      });
      return;
    }

    const parsed = parseFloat(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    const calculatedBytes = unitValueToBytes(parsed, unit);
    onChange({
      ...config,
      numericInput: rawValue,
      targetBytes: calculatedBytes,
    });
  };

  const handleNumericBlur = () => {
    if (!numericInput || targetBytes <= 0) {
      // Restore a sensible minimum (1 KB) if left blank or 0
      const fallbackBytes = Math.min(originalBytes, BYTES_PER_KB);
      onChange({
        ...config,
        targetBytes: fallbackBytes,
        numericInput: formatNumericInput(fallbackBytes, unit),
      });
    }
  };

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newUnit = e.target.value as SizeUnit;
    if (newUnit === unit) return;

    // Preserve the exact intended byte size when switching between KB and MB
    onChange({
      ...config,
      unit: newUnit,
      numericInput: formatNumericInput(targetBytes, newUnit),
    });
  };

  const isTargetAboveOriginal = targetBytes >= originalBytes && targetBytes > 0;
  const isTargetExtremelySmall =
    targetBytes > 0 &&
    targetBytes < originalBytes &&
    (targetBytes < 10 * BYTES_PER_KB || targetBytes < originalBytes * 0.04);

  const stepValue = unit === 'MB' ? '0.05' : '1';
  const minInputUnitValue =
    unit === 'MB'
      ? Number((BYTES_PER_KB / BYTES_PER_MB).toFixed(4))
      : 1;

  return (
    <section
      aria-labelledby="target-size-heading"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="target-size-heading"
          className="text-base font-semibold text-slate-900"
        >
          Target output size
        </h2>
        <span className="font-mono text-xs font-medium text-slate-600 tabular-nums">
          {ratioOfOriginal}% of original
        </span>
      </div>

      {/* A. Horizontal Range Slider */}
      <div className="mt-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 flex items-center">
            <input
              id="target-size-slider"
              type="range"
              min={minSliderBytes}
              max={maxSliderBytes}
              step={Math.max(256, Math.round(sliderSpan / 200))}
              value={clampedSliderBytes}
              disabled={disabled}
              onChange={handleSliderChange}
              aria-label="Target output size slider"
              style={{
                background: `linear-gradient(to right, #0284c7 0%, #0284c7 ${sliderPercentage}%, #e2e8f0 ${sliderPercentage}%, #e2e8f0 100%)`,
              }}
              className="target-slider w-full h-2 rounded-full disabled:opacity-50"
            />
          </div>
          <span className="w-12 text-right font-mono text-sm font-semibold text-sky-700 tabular-nums shrink-0">
            {Math.min(999, Math.max(1, ratioOfOriginal))}%
          </span>
        </div>

        <div className="mt-1.5 flex justify-between text-xs text-slate-400 font-mono tabular-nums">
          <span>{formatBytes(minSliderBytes)}</span>
          <span>{formatBytes(maxSliderBytes)}</span>
        </div>
      </div>

      {/* B & C. Numerical Input and KB/MB Unit Selector */}
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-36 sm:flex-initial">
            <label htmlFor="target-size-number" className="sr-only">
              Target size numeric value
            </label>
            <input
              id="target-size-number"
              type="number"
              inputMode="decimal"
              min={minInputUnitValue}
              step={stepValue}
              value={numericInput}
              disabled={disabled}
              onChange={handleNumericInputChange}
              onBlur={handleNumericBlur}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm font-semibold text-slate-900 tabular-nums transition-colors focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="target-size-unit" className="sr-only">
              Target size unit
            </label>
            <select
              id="target-size-unit"
              value={unit}
              disabled={disabled}
              onChange={handleUnitChange}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50 cursor-pointer"
            >
              <option value="KB">KB</option>
              <option value="MB">MB</option>
            </select>
          </div>
        </div>

        {/* Original vs Target Size Summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
          <div className="text-slate-600">
            <span>Original size: </span>
            <span className="font-mono font-semibold text-slate-900">
              {formatBytes(originalBytes)}
            </span>
          </div>
          <div className="text-slate-600">
            <span>Target size: </span>
            <span className="font-mono font-semibold text-sky-700">
              {targetBytes > 0 ? formatBytes(targetBytes) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Explanatory notices for extreme or above-original targets */}
      {isTargetAboveOriginal && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-900">
          <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" aria-hidden="true" />
          <p>
            The original file ({formatBytes(originalBytes)}) is already smaller than or equal to
            your requested target ({formatBytes(targetBytes)}). Compressing will preserve your
            original file without unnecessary quality loss.
          </p>
        </div>
      )}

      {isTargetExtremelySmall && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-amber-600 mt-0.5"
            aria-hidden="true"
          />
          <p>
            Requested target ({formatBytes(targetBytes)}) is very small ({ratioOfOriginal}% of
            original). This target may not be achievable due to format headers and minimum
            resolution limits, or may noticeably reduce visual clarity. We will produce the closest
            valid output possible.
          </p>
        </div>
      )}
    </section>
  );
}
