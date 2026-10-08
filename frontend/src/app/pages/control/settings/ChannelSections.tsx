import { useState } from "react";
import { channelNumbers } from "../../../../lib/channels";
import type { GroupComponentProps, ToggleControlDef } from "../../../controls";
import { ChannelSection } from "./ChannelSection";

export interface ChannelSectionsProps extends GroupComponentProps {
  disabledReason?: string;
}

/**
 * Body of a `perChannel` group: one {@link ChannelSection} per channel.
 * Enabled channels start expanded, disabled ones collapsed; a manual toggle
 * of a section wins until the inspector unmounts.
 *
 * @param props - See {@link ChannelSectionsProps}
 * @returns The list of channel sections
 */
export function ChannelSections({
  deviceId,
  group,
  ctx,
  disabled,
  disabledReason,
}: ChannelSectionsProps) {
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const enableDef = group.controls.find(
    (c): c is ToggleControlDef =>
      c.kind === "toggle" && c.key === group.enableKey,
  );
  const detail = group.controls.filter((c) => c !== enableDef);

  return (
    <div className="space-y-2">
      {channelNumbers(ctx.channelCount)
        .filter((n) => ctx.settings.channels[n])
        .map((n) => (
          <ChannelSection
            key={n}
            deviceId={deviceId}
            group={group}
            channel={n}
            ctx={ctx}
            disabled={disabled}
            disabledReason={disabledReason}
            controls={detail}
            enableDef={enableDef}
            open={overrides[n] ?? ctx.settings.channels[n].enabled}
            onOpenChange={(open) =>
              setOverrides((prev) => ({ ...prev, [n]: open }))
            }
          />
        ))}
    </div>
  );
}
