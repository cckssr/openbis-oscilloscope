import { NumericInput } from "./NumericInput";
import { SegmentedControl } from "./SegmentedControl";
import type { ChannelConfig } from "../../api/types";

interface ChannelsPanelProps {
  channelSettings: Record<number, ChannelConfig>;
  setChannelSettings: React.Dispatch<
    React.SetStateAction<Record<number, ChannelConfig>>
  >;
  isLocked: boolean;
  applyingChannels: boolean;
  channelsDirty: boolean;
  onApply: () => void;
  /** When true, only show enable/disable toggles (production mode). */
  restrictedMode?: boolean;
}

export function ChannelsPanel({
  channelSettings,
  setChannelSettings,
  isLocked,
  applyingChannels,
  channelsDirty,
  onApply,
  restrictedMode = false,
}: ChannelsPanelProps) {
  return (
    <>
      {([1, 2, 3, 4] as const).map((ch) => {
        const color = `var(--ch${ch}-color)`;
        const cfg = channelSettings[ch];
        if (!cfg) return null;
        const probeLabel =
          cfg.probe_attenuation === 1
            ? "1×"
            : cfg.probe_attenuation === 10
              ? "10×"
              : "100×";

        return (
          <div
            key={ch}
            className="border-2 border-(--lab-border) rounded overflow-hidden bg-white"
          >
            <button
              onClick={() => {
                if (restrictedMode) return;
                setChannelSettings((prev) => ({
                  ...prev,
                  [ch]: { ...prev[ch], enabled: !prev[ch].enabled },
                }));
              }}
              disabled={restrictedMode}
              className={`w-full flex items-center justify-between p-3 transition-colors ${
                restrictedMode
                  ? "cursor-default"
                  : "hover:bg-(--lab-panel) cursor-pointer"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full border-2"
                  style={{
                    backgroundColor: cfg.enabled ? color : "#FFFFFF",
                    borderColor: color,
                  }}
                />
                <span className="font-medium text-sm text-(--lab-text-primary)">
                  CH{ch}
                </span>
                {restrictedMode && (
                  <span className="text-xs text-(--lab-text-secondary) font-mono">
                    {cfg.enabled ? "AN" : "AUS"}
                  </span>
                )}
              </div>
              {!restrictedMode && (
                <label className="flex items-center gap-2 text-xs text-(--lab-text-secondary) cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={() =>
                      setChannelSettings((prev) => ({
                        ...prev,
                        [ch]: { ...prev[ch], enabled: !prev[ch].enabled },
                      }))
                    }
                    className="w-4 h-4 accent-(--lab-accent)"
                  />
                  Aktivieren
                </label>
              )}
            </button>

            {/* Expert mode: full channel controls when enabled */}
            {!restrictedMode && cfg.enabled && (
              <div className="px-3 pb-3 space-y-3 border-t-2 border-(--lab-border)">
                <div className="pt-3">
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Vertikale Skalierung
                  </label>
                  <p className="text-[10px] text-(--lab-text-secondary) mb-1">Volt pro Division (V/div)</p>
                  <NumericInput
                    value={cfg.scale_v_div}
                    unit="V/div"
                    onChange={(val) =>
                      setChannelSettings((prev) => ({
                        ...prev,
                        [ch]: { ...prev[ch], scale_v_div: val },
                      }))
                    }
                    step={0.5}
                    min={0.001}
                    max={10}
                  />
                </div>
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Vertikaler Offset
                  </label>
                  <NumericInput
                    value={cfg.offset_v}
                    unit="V"
                    onChange={(val) =>
                      setChannelSettings((prev) => ({
                        ...prev,
                        [ch]: { ...prev[ch], offset_v: val },
                      }))
                    }
                    step={0.1}
                    min={-10}
                    max={10}
                  />
                </div>
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Kopplung
                  </label>
                  <p className="text-[10px] text-(--lab-text-secondary) mb-1">AC: Gleichanteil blockiert · DC: vollständig · GND: Masse</p>
                  <SegmentedControl
                    options={["AC", "DC", "GND"]}
                    value={cfg.coupling}
                    onChange={(val) =>
                      setChannelSettings((prev) => ({
                        ...prev,
                        [ch]: {
                          ...prev[ch],
                          coupling: val as "AC" | "DC" | "GND",
                        },
                      }))
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-(--lab-text-secondary) mb-1">
                    Tastkopf
                  </label>
                  <p className="text-[10px] text-(--lab-text-secondary) mb-1">Dämpfungsfaktor der Tastleitung</p>
                  <SegmentedControl
                    options={["1×", "10×", "100×"]}
                    value={probeLabel}
                    onChange={(val) =>
                      setChannelSettings((prev) => ({
                        ...prev,
                        [ch]: {
                          ...prev[ch],
                          probe_attenuation:
                            val === "1×" ? 1 : val === "10×" ? 10 : 100,
                        },
                      }))
                    }
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Apply button only in expert mode */}
      {!restrictedMode && (
        <button
          onClick={onApply}
          disabled={!isLocked || applyingChannels || !channelsDirty}
          className="w-full py-2 px-4 border-2 rounded font-medium text-sm transition-colors border-(--lab-accent) text-(--lab-accent) bg-white hover:bg-(--lab-accent) hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {applyingChannels ? "Übernehmen…" : "Kanäle übernehmen"}
        </button>
      )}
    </>
  );
}
