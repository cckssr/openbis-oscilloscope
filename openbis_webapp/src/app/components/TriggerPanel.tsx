import { NumericInput } from "./NumericInput";
import { SegmentedControl } from "./SegmentedControl";
import type { TriggerConfig } from "../../api/types";

interface TriggerPanelProps {
  triggerSettings: TriggerConfig;
  setTriggerSettings: React.Dispatch<React.SetStateAction<TriggerConfig>>;
  isLocked: boolean;
  applyingTrigger: boolean;
  triggerDirty: boolean;
  onApply: () => void;
}

export function TriggerPanel({
  triggerSettings,
  setTriggerSettings,
  isLocked,
  applyingTrigger,
  triggerDirty,
  onApply,
}: TriggerPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">
          Triggermodus
        </label>
        <p className="text-[10px] text-(--lab-text-secondary) mb-2">AUTO: ohne Trigger · NORMAL: wartet auf Trigger · SINGLE: eine Aufnahme</p>
        <SegmentedControl
          options={["AUTO", "NORMAL", "SINGLE"]}
          value={triggerSettings.mode}
          onChange={(val) =>
            setTriggerSettings((prev) => ({
              ...prev,
              mode: val as TriggerConfig["mode"],
            }))
          }
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-2">
          Triggerquelle
        </label>
        <SegmentedControl
          options={["CH1", "CH2", "CH3", "CH4"]}
          value={triggerSettings.source}
          onChange={(val) =>
            setTriggerSettings((prev) => ({ ...prev, source: val }))
          }
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">
          Triggerflanke
        </label>
        <p className="text-[10px] text-(--lab-text-secondary) mb-2">RISE: steigend · FALL: fallend · EITHER: beide Flanken</p>
        <SegmentedControl
          options={["RISE", "FALL", "EITHER"]}
          value={triggerSettings.slope}
          onChange={(val) =>
            setTriggerSettings((prev) => ({
              ...prev,
              slope: val as TriggerConfig["slope"],
            }))
          }
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">
          Triggerpegel
        </label>
        <p className="text-[10px] text-(--lab-text-secondary) mb-1">Spannungsschwelle, bei der der Trigger auslöst</p>
        <NumericInput
          value={triggerSettings.level_v}
          unit="V"
          onChange={(val) =>
            setTriggerSettings((prev) => ({ ...prev, level_v: val }))
          }
          step={0.1}
          min={-10}
          max={10}
        />
      </div>

      <button
        onClick={onApply}
        disabled={!isLocked || applyingTrigger || !triggerDirty}
        className="w-full py-2 px-4 border-2 rounded font-medium text-sm transition-colors border-(--lab-accent) text-(--lab-accent) bg-white hover:bg-(--lab-accent) hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {applyingTrigger ? "Übernehmen…" : "Trigger übernehmen"}
      </button>
    </div>
  );
}
