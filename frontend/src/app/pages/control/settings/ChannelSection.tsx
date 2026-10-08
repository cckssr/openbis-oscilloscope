import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../components/ui/collapsible";
import { cn } from "../../../components/ui/utils";
import { channelColor } from "../../../../lib/channels";
import { de } from "../../../../i18n/de";
import { ControlRenderer } from "../../../controls/renderers";
import { ToggleControl } from "../../../controls/renderers/ToggleControl";
import { controlPath } from "../../../controls/paths";
import type {
  ControlContext,
  ControlDef,
  ControlGroupDef,
  ToggleControlDef,
} from "../../../controls";

const t = de.settings.channel;

export interface ChannelSectionProps {
  deviceId: string;
  group: ControlGroupDef;
  channel: number;
  /** Context of the whole device; the channel is added here. */
  ctx: ControlContext;
  disabled: boolean;
  disabledReason?: string;
  /** Controls shown inside the section (everything except the header toggle). */
  controls: ControlDef[];
  /** The on/off toggle shown in the header, if the group has one. */
  enableDef?: ToggleControlDef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One channel: colour chip, one-line summary and the on/off switch stay
 * visible; the detailed controls collapse. Without detail controls (level
 * "Einfach") it is a flat row.
 *
 * @param props - See {@link ChannelSectionProps}
 * @returns The section
 */
export function ChannelSection({
  deviceId,
  group,
  channel,
  ctx,
  disabled,
  disabledReason,
  controls,
  enableDef,
  open,
  onOpenChange,
}: ChannelSectionProps) {
  const channelCtx = useMemo(() => ({ ...ctx, channel }), [ctx, channel]);
  const enabled = ctx.settings.channels[channel]?.enabled === true;
  const color = channelColor(channel);
  const summary = group.summary?.(channelCtx) ?? `CH${channel}`;
  const visible = controls.filter((c) => c.visible?.(channelCtx) !== false);
  const collapsible = visible.length > 0;

  const chip = (
    <span
      aria-hidden
      className="size-3.5 shrink-0 rounded-full border-2"
      style={{
        borderColor: color,
        backgroundColor: enabled ? color : "transparent",
      }}
    />
  );
  const summaryText = (
    <span
      className={cn(
        "min-w-0 flex-1 break-words text-sm coarse:text-base",
        enabled
          ? "font-medium text-(--lab-text-primary)"
          : "text-(--lab-text-secondary)",
      )}
    >
      {summary}
    </span>
  );
  const toggle = enableDef && (
    <ToggleControl
      compact
      deviceId={deviceId}
      def={{ ...enableDef, label: t.toggleAria(`CH${channel}`) }}
      path={controlPath(group, enableDef, channel)}
      ctx={channelCtx}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );

  return (
    <Collapsible
      open={collapsible && open}
      onOpenChange={onOpenChange}
      data-channel={channel}
      className="min-w-0 rounded border-2 border-(--lab-border) bg-white"
    >
      <div className="flex items-center gap-2 pr-2">
        {collapsible ? (
          <CollapsibleTrigger
            aria-label={t.expand(`CH${channel}`)}
            className="tap-target flex min-w-0 flex-1 items-center gap-2 rounded p-2 text-left outline-none hover:bg-(--lab-panel) focus-visible:ring-2 focus-visible:ring-(--lab-accent)/40 [&[data-state=open]>svg]:rotate-90"
          >
            <ChevronRight
              className="size-4 shrink-0 text-(--lab-text-secondary) transition-transform"
              aria-hidden
            />
            {chip}
            {summaryText}
          </CollapsibleTrigger>
        ) : (
          <div className="tap-target flex min-w-0 flex-1 items-center gap-2 p-2">
            {chip}
            {summaryText}
          </div>
        )}
        {toggle}
      </div>
      {collapsible && (
        <CollapsibleContent className="space-y-3 border-t-2 border-(--lab-border) p-3">
          {visible.map((def) => (
            <ControlRenderer
              key={def.key}
              deviceId={deviceId}
              def={def}
              path={controlPath(group, def, channel)}
              ctx={channelCtx}
              disabled={disabled}
              disabledReason={disabledReason}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
