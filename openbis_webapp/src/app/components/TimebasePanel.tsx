import { NumericInput } from "./NumericInput";
import type { TimebaseConfig } from "../../api/types";

interface TimebasePanelProps {
  timebaseSettings: Omit<TimebaseConfig, "sample_rate">;
  setTimebaseSettings: React.Dispatch<
    React.SetStateAction<Omit<TimebaseConfig, "sample_rate">>
  >;
  isLocked: boolean;
  applyingTimebase: boolean;
  timebaseDirty: boolean;
  onApply: () => void;
}

const SCALE_OPTIONS: [number, string][] = [
  [5e-9, "5 ns/div"],
  [10e-9, "10 ns/div"],
  [20e-9, "20 ns/div"],
  [50e-9, "50 ns/div"],
  [100e-9, "100 ns/div"],
  [1e-6, "1 µs/div"],
  [10e-6, "10 µs/div"],
  [100e-6, "100 µs/div"],
  [1e-3, "1 ms/div"],
  [10e-3, "10 ms/div"],
  [100e-3, "100 ms/div"],
  [1, "1 s/div"],
];

export function TimebasePanel({
  timebaseSettings,
  setTimebaseSettings,
  isLocked,
  applyingTimebase,
  timebaseDirty,
  onApply,
}: TimebasePanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-2">
          Horizontal Scale
        </label>
        <select
          value={timebaseSettings.scale_s_div}
          onChange={(e) =>
            setTimebaseSettings((prev) => ({
              ...prev,
              scale_s_div: Number(e.target.value),
            }))
          }
          className="w-full bg-white border-2 border-(--lab-border) text-(--lab-text-primary) px-3 py-2 text-sm rounded focus:outline-none focus:border-(--lab-accent)"
        >
          {SCALE_OPTIONS.map(([v, label]) => (
            <option key={String(v)} value={Number(v)}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">
          Horizontal Offset
        </label>
        <NumericInput
          value={timebaseSettings.offset_s}
          unit="s"
          onChange={(val) =>
            setTimebaseSettings((prev) => ({ ...prev, offset_s: val }))
          }
          step={0.001}
        />
      </div>

      <button
        onClick={onApply}
        disabled={!isLocked || applyingTimebase || !timebaseDirty}
        className="w-full py-2 px-4 border-2 rounded font-medium text-sm transition-colors border-(--lab-accent) text-(--lab-accent) bg-white hover:bg-(--lab-accent) hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {applyingTimebase ? "Applying…" : "Apply Timebase"}
      </button>
    </div>
  );
}
