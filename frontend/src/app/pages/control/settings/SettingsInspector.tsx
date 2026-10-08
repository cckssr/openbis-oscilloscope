import { useMemo } from "react";
import { Skeleton } from "../../../components/ui/skeleton";
import { cn } from "../../../components/ui/utils";
import { de } from "../../../../i18n/de";
import { getControlGroups, type ControlContext, type ControlLevel } from "../../../controls";
import { useInspectorModel } from "../../../controls/store";
import { GroupAccordion } from "./GroupAccordion";
import { GroupBody } from "./GroupBody";
import { GroupTabs } from "./GroupTabs";
import { ReadOnlyBanner } from "./ReadOnlyBanner";

const t = de.settings.inspector;

export interface SettingsInspectorProps {
  deviceId: string;
  /** `basic` = "Einfach" (channel on/off), `expert` = "Erweitert" (everything). */
  level: ControlLevel;
  /** False renders all controls read-only with a banner explaining why. */
  canEdit: boolean;
  /** Replaces the default banner text, e.g. "Das Gerät wird in einem anderen Tab gesteuert". */
  readOnlyReason?: string;
  /** Adds a "Gerät übernehmen" button to the read-only banner. */
  onTakeControl?: () => void;
  /** `tabs` (default, side panel) or `accordion` (narrow sheet). */
  layout?: "tabs" | "accordion";
  className?: string;
}

/**
 * Settings of one device, built from the registered control groups
 * (channels, timebase, trigger …). Changes are applied immediately; every
 * control shows its own status. Works from 280 px container width up; the
 * parent is responsible for scrolling.
 *
 * @param props - See {@link SettingsInspectorProps}
 * @returns The inspector
 */
export function SettingsInspector({
  deviceId,
  level,
  canEdit,
  readOnlyReason,
  onTakeControl,
  layout = "tabs",
  className,
}: SettingsInspectorProps) {
  const { capabilities, channelCount, settings, loading } = useInspectorModel(deviceId);
  const groups = useMemo(
    () => getControlGroups({ level, capabilities, channelCount }),
    [level, capabilities, channelCount],
  );
  const ctx = useMemo<ControlContext | null>(
    () => (settings ? { settings, channelCount } : null),
    [settings, channelCount],
  );
  const reason = readOnlyReason ?? t.readOnlyTitle;

  let content;
  if (!ctx) {
    content = loading ? (
      <div className="space-y-2" aria-busy>
        <p className="help-text">{t.loading}</p>
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    ) : (
      <p className="help-text">{canEdit ? t.notLoaded : t.notLoadedReadOnly}</p>
    );
  } else if (groups.length === 0) {
    content = <p className="help-text">{t.noGroups}</p>;
  } else {
    const body = { deviceId, ctx, disabled: !canEdit, disabledReason: reason };
    if (layout === "accordion") content = <GroupAccordion groups={groups} {...body} />;
    else if (groups.length === 1) content = <GroupBody group={groups[0]} {...body} />;
    else content = <GroupTabs groups={groups} {...body} />;
  }

  return (
    <section
      aria-label={t.ariaLabel}
      data-level={level}
      className={cn("@container flex min-w-0 flex-col gap-3", className)}
    >
      {!canEdit && <ReadOnlyBanner reason={readOnlyReason} onTakeControl={onTakeControl} />}
      <div className={cn("min-w-0", !canEdit && "opacity-70")}>{content}</div>
    </section>
  );
}
