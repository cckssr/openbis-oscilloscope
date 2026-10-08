/** Channel group: one section per analog channel (`channels.<n>.<key>`). */
import { Activity } from "lucide-react";
import { de } from "../../../i18n/de";
import { channelLabel } from "../../../lib/channels";
import { VOLT_PER_DIV_STEPS, formatPerDiv } from "../../../lib/units";
import type { ControlContext, ControlDef, ControlGroupDef } from "../types";

const t = de.settings.groups.channels;
const c = de.settings.channel;

/** Config of the channel a context refers to. */
const channelConfig = (ctx: ControlContext) =>
  ctx.channel === undefined ? undefined : ctx.settings.channels[ctx.channel];

/** Channel controls other than the on/off toggle only make sense for an enabled channel. */
const whenEnabled = (ctx: ControlContext) => channelConfig(ctx)?.enabled === true;

/**
 * One-line summary of a channel, or of all channels when no channel is given.
 * @param ctx - Context; `ctx.channel` selects the channel
 * @returns `CH1 · 200 mV/div · DC · 1×`, `CH2 · aus` or `2 von 4 an`
 */
export function channelSummary(ctx: ControlContext): string {
  if (ctx.channel === undefined) {
    const all = Object.values(ctx.settings.channels);
    return c.countOn(all.filter((cfg) => cfg.enabled).length, ctx.channelCount);
  }
  const cfg = channelConfig(ctx);
  const label = channelLabel(ctx.channel);
  if (!cfg) return label;
  if (!cfg.enabled) return `${label} · ${c.off}`;
  return [
    label,
    formatPerDiv(cfg.scale_v_div, "V"),
    cfg.coupling,
    c.probe(cfg.probe_attenuation),
  ].join(" · ");
}

const controls: ControlDef[] = [
  {
    kind: "toggle",
    key: "enabled",
    label: t.enabled.label,
    help: t.enabled.help,
    level: "basic",
  },
  {
    kind: "number",
    key: "scale_v_div",
    label: t.scale.label,
    help: t.scale.help,
    unit: "V/div",
    min: VOLT_PER_DIV_STEPS[0],
    max: VOLT_PER_DIV_STEPS[VOLT_PER_DIV_STEPS.length - 1],
    scale: VOLT_PER_DIV_STEPS,
    level: "expert",
    visible: whenEnabled,
  },
  {
    kind: "number",
    key: "offset_v",
    label: t.offset.label,
    help: t.offset.help,
    unit: "V",
    min: -10,
    max: 10,
    scale: "linear",
    step: (ctx) => (channelConfig(ctx)?.scale_v_div ?? 1) / 10,
    level: "expert",
    visible: whenEnabled,
  },
  {
    kind: "enum",
    key: "coupling",
    label: t.coupling.label,
    help: t.coupling.help,
    options: (["AC", "DC", "GND"] as const).map((value) => ({
      value,
      ...t.coupling.options[value],
    })),
    level: "expert",
    visible: whenEnabled,
  },
  {
    kind: "enum",
    key: "probe_attenuation",
    label: t.probe.label,
    help: t.probe.help,
    options: [1, 10, 100].map((value) => ({ value, label: c.probe(value) })),
    level: "expert",
    visible: whenEnabled,
  },
];

/** The channel group definition. */
export const channelsGroup: ControlGroupDef = {
  id: "channels",
  label: t.label,
  icon: Activity,
  level: "basic",
  perChannel: true,
  enableKey: "enabled",
  controls,
  summary: channelSummary,
};
