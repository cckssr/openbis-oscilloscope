/** Horizontal group: time base (s/div) and time offset. */
import { Clock } from "lucide-react";
import { de } from "../../../i18n/de";
import { SEC_PER_DIV_STEPS, formatPerDiv, formatSI } from "../../../lib/units";
import type { ControlGroupDef } from "../types";

const t = de.settings.groups.timebase;

/** The horizontal (timebase) group definition. */
export const timebaseGroup: ControlGroupDef = {
  id: "timebase",
  label: t.label,
  icon: Clock,
  level: "expert",
  controls: [
    {
      kind: "number",
      key: "scale_s_div",
      label: t.scale.label,
      help: t.scale.help,
      unit: "s/div",
      min: SEC_PER_DIV_STEPS[0],
      max: SEC_PER_DIV_STEPS[SEC_PER_DIV_STEPS.length - 1],
      scale: SEC_PER_DIV_STEPS,
      level: "expert",
    },
    {
      kind: "number",
      key: "offset_s",
      label: t.offset.label,
      help: t.offset.help,
      unit: "s",
      scale: "linear",
      step: (ctx) => ctx.settings.timebase.scale_s_div / 10,
      level: "expert",
    },
  ],
  summary: (ctx) =>
    [
      formatPerDiv(ctx.settings.timebase.scale_s_div, "s"),
      t.summaryOffset(formatSI(ctx.settings.timebase.offset_s, "s")),
    ].join(" · "),
};
