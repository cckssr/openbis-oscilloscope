import { Pause, Play, Repeat, Square, Target, WandSparkles, Zap } from "lucide-react";
import { de } from "../../../../i18n/de";
import { HelpPopover } from "../../../components/common";
import { cn } from "../../../components/ui/utils";
import { ActionButton } from "./ActionButton";
import { availability, commonReason } from "./availability";
import type { ActionLayout } from "./layout";
import { useActionModel, useDeviceActions } from "./session";
import { MoreMenu, type MoreMenuItem } from "./MoreMenu";
import { withShortcut } from "./shortcuts";

const t = de.control.actions;

export interface LiveControlsProps {
  deviceId: string;
  /** "basic" shows Live, Scope stopp and Auto-Setup; "expert" adds trigger and series controls. */
  level: "basic" | "expert";
  /** column = desktop side column, icon = collapsed desktop column, rail = 72 px tablet icon rail, bar = portrait bottom bar. */
  layout: ActionLayout;
}

const CONTAINER: Record<ActionLayout, string> = {
  column: "flex flex-col gap-2",
  icon: "flex flex-col items-center gap-2",
  rail: "flex w-[72px] flex-col gap-2",
  bar: "flex flex-row flex-wrap items-start gap-2",
};

/**
 * Live preview and scope-command buttons: one Live toggle (never "start" and
 * "stop" at once), hardware STOP ("Scope stopp"), Auto-Setup, and in expert
 * level single trigger, forced trigger and series capture. In the portrait
 * bottom bar the three expert extras move into a "Mehr ▾" menu (a running
 * series keeps its red stop button in the bar). Controls the device lacks a
 * capability for are hidden; disabled ones explain why.
 *
 * @param props - See {@link LiveControlsProps}
 * @returns The control group
 */
export function LiveControls({ deviceId, level, layout }: LiveControlsProps) {
  const model = useActionModel(deviceId);
  const actions = useDeviceActions(deviceId);
  const av = availability(model);
  const groupReason = commonReason(model);
  const inlineReason = layout === "column" && !groupReason;
  const expert = level === "expert";

  const liveRunning = model.liveStatus === "on" || model.liveStatus === "paused";
  const liveStarting = model.liveStatus === "starting";
  const overflow = layout === "bar" && expert;
  const moreItems: MoreMenuItem[] = [];
  if (overflow && av.single.visible) {
    moreItems.push({
      id: "single",
      icon: <Target className="size-4" aria-hidden />,
      label: t.single.label,
      hint: t.single.hint,
      reason: av.single.reason,
      onSelect: () => void actions.single(),
      testId: "single",
    });
  }
  if (overflow && av.forceTrigger.visible) {
    moreItems.push({
      id: "force-trigger",
      icon: <Zap className="size-4" aria-hidden />,
      label: t.forceTrigger.label,
      hint: t.forceTrigger.hint,
      reason: av.forceTrigger.reason,
      onSelect: () => void actions.forceTrigger(),
      testId: "force-trigger",
    });
  }
  if (overflow && av.series.visible && !model.seriesOn) {
    moreItems.push({
      id: "series",
      icon: <Repeat className="size-4" aria-hidden />,
      label: t.series.start,
      hint: t.series.hint,
      reason: av.series.reason,
      onSelect: () => actions.startSeries(),
      testId: "series",
    });
  }

  return (
    <div className={cn(CONTAINER[layout])} data-testid="live-controls" data-layout={layout}>
      {av.liveToggle.visible && (
        <ActionButton
          layout={layout}
          testId="live-toggle"
          icon={liveRunning ? <Square /> : <Play />}
          label={liveStarting ? t.live.starting : liveRunning ? t.live.stop : t.live.start}
          railLabel={liveStarting ? t.live.railStarting : liveRunning ? t.live.railStop : t.live.railStart}
          variant={liveRunning ? "danger" : "outline"}
          loading={liveStarting}
          reason={av.liveToggle.reason}
          inlineReason={inlineReason}
          hint={withShortcut(liveRunning ? t.live.stopHint : t.live.startHint, "live")}
          onClick={() => (liveRunning ? actions.stopLive() : void actions.startLive())}
        />
      )}
      {av.stopScope.visible && (
        <ActionButton
          layout={layout}
          testId="stop-scope"
          icon={<Pause />}
          label={t.stopScope.label}
          railLabel={t.stopScope.rail}
          reason={av.stopScope.reason}
          inlineReason={inlineReason}
          hint={t.stopScope.hint}
          onClick={() => void actions.stopScope()}
        />
      )}
      {av.autoscale.visible && (
        <div className={cn("flex items-center gap-1", layout === "rail" && "w-full")}>
          <div className="min-w-0 flex-1">
            <ActionButton
              layout={layout}
              testId="autoscale"
              icon={<WandSparkles />}
              label={t.autoscale.label}
              railLabel={t.autoscale.rail}
              reason={av.autoscale.reason}
              inlineReason={inlineReason}
              hint={t.autoscale.hint}
              onClick={() => void actions.autoscale()}
            />
          </div>
          {(layout === "column" || layout === "bar") && (
            <HelpPopover label={t.autoscale.helpLabel} title={t.autoscale.helpTitle}>
              {t.autoscale.help}
            </HelpPopover>
          )}
        </div>
      )}
      {!overflow && expert && av.single.visible && (
        <ActionButton
          layout={layout}
          testId="single"
          icon={<Target />}
          label={t.single.label}
          railLabel={t.single.rail}
          reason={av.single.reason}
          inlineReason={inlineReason}
          hint={t.single.hint}
          onClick={() => void actions.single()}
        />
      )}
      {!overflow && expert && av.forceTrigger.visible && (
        <ActionButton
          layout={layout}
          testId="force-trigger"
          icon={<Zap />}
          label={t.forceTrigger.label}
          railLabel={t.forceTrigger.rail}
          reason={av.forceTrigger.reason}
          inlineReason={inlineReason}
          hint={t.forceTrigger.hint}
          onClick={() => void actions.forceTrigger()}
        />
      )}
      {expert && av.series.visible && (!overflow || model.seriesOn) && (
        <ActionButton
          layout={layout}
          testId="series"
          icon={model.seriesOn ? <Square /> : <Repeat />}
          label={
            model.seriesOn
              ? `${t.series.stop} · ${t.series.count(model.seriesCount)}`
              : t.series.start
          }
          railLabel={model.seriesOn ? `${t.series.railStop} ${model.seriesCount}` : t.series.rail}
          variant={model.seriesOn ? "danger" : "secondary"}
          // The running label ("… stoppen · 4 Aufnahmen") is longer than the 260 px column: wrap instead of clipping.
          className={layout === "column" ? "h-auto min-h-9 py-1.5 text-left whitespace-normal coarse:min-h-11" : undefined}
          reason={av.series.reason}
          inlineReason={inlineReason}
          hint={t.series.hint}
          onClick={() => (model.seriesOn ? actions.stopSeries() : actions.startSeries())}
        />
      )}
      {overflow && <MoreMenu items={moreItems} />}
      {groupReason && (
        <p
          className={cn(
            "help-text",
            layout === "rail" && "text-center text-[11px] leading-tight",
            layout === "icon" && "sr-only",
          )}
          data-testid="live-controls-reason"
        >
          {groupReason}
        </p>
      )}
    </div>
  );
}
