/** Trigger group: mode, source, slope and level. */
import { Zap } from "lucide-react";
import { de } from "../../../i18n/de";
import { channelLabel, channelNumbers } from "../../../lib/channels";
import { formatSI } from "../../../lib/units";
import type { ControlContext, ControlGroupDef } from "../types";

const t = de.settings.groups.trigger;

/** Channel number of the trigger source (`"CH2"` → 2), or undefined for non-channel sources. */
function sourceChannel(ctx: ControlContext): number | undefined {
  const match = /^CH(\d+)$/.exec(ctx.settings.trigger.source);
  return match ? Number(match[1]) : undefined;
}

/** V/div of the trigger source; the trigger level is stepped in tenths of it. */
function sourceVoltPerDiv(ctx: ControlContext): number {
  const n = sourceChannel(ctx);
  return (n !== undefined ? ctx.settings.channels[n]?.scale_v_div : undefined) ?? 1;
}

/** The trigger group definition. */
export const triggerGroup: ControlGroupDef = {
  id: "trigger",
  label: t.label,
  icon: Zap,
  level: "expert",
  controls: [
    {
      kind: "enum",
      key: "mode",
      label: t.mode.label,
      help: t.mode.help,
      options: (["AUTO", "NORMAL", "SINGLE"] as const).map((value) => ({
        value,
        ...t.mode.options[value],
      })),
      level: "expert",
    },
    {
      kind: "enum",
      key: "source",
      label: t.source.label,
      help: t.source.help,
      options: (ctx) =>
        channelNumbers(ctx.channelCount).map((n) => ({
          value: channelLabel(n),
          label: channelLabel(n),
        })),
      level: "expert",
    },
    {
      kind: "enum",
      key: "slope",
      label: t.slope.label,
      help: t.slope.help,
      options: (["RISE", "FALL", "EITHER"] as const).map((value) => ({
        value,
        ...t.slope.options[value],
      })),
      level: "expert",
    },
    {
      kind: "number",
      key: "level_v",
      label: t.level.label,
      help: t.level.help,
      unit: "V",
      min: -10,
      max: 10,
      scale: "linear",
      step: (ctx) => sourceVoltPerDiv(ctx) / 10,
      level: "expert",
    },
  ],
  summary: (ctx) => {
    const trg = ctx.settings.trigger;
    return [
      t.mode.options[trg.mode]?.label ?? trg.mode,
      trg.source,
      t.slopeSymbol[trg.slope] ?? trg.slope,
      formatSI(trg.level_v, "V"),
    ].join(" · ");
  },
};
