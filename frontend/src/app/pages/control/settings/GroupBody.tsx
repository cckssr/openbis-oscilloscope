import { RegionBoundary } from "../../../components/common";
import { ControlRenderer } from "../../../controls/renderers";
import { controlPath } from "../../../controls/paths";
import type { ControlContext, ControlGroupDef } from "../../../controls";
import { ChannelSections } from "./ChannelSections";

export interface GroupBodyProps {
  deviceId: string;
  group: ControlGroupDef;
  ctx: ControlContext;
  disabled: boolean;
  disabledReason?: string;
}

/**
 * Content of one settings group, isolated in a {@link RegionBoundary} so a
 * broken control cannot take the page down. Uses the group's custom component
 * if it has one, per-channel sections for `perChannel` groups, else a plain
 * list of generic controls.
 *
 * @param props - See {@link GroupBodyProps}
 * @returns The group content
 */
export function GroupBody({
  deviceId,
  group,
  ctx,
  disabled,
  disabledReason,
}: GroupBodyProps) {
  const Custom = group.component;
  return (
    <RegionBoundary name={group.label} resetKeys={[deviceId]}>
      {Custom ? (
        <Custom
          deviceId={deviceId}
          group={group}
          ctx={ctx}
          disabled={disabled}
        />
      ) : group.perChannel ? (
        <ChannelSections
          deviceId={deviceId}
          group={group}
          ctx={ctx}
          disabled={disabled}
          disabledReason={disabledReason}
        />
      ) : (
        <div className="space-y-4">
          {group.controls
            .filter((def) => def.visible?.(ctx) !== false)
            .map((def) => (
              <ControlRenderer
                key={def.key}
                deviceId={deviceId}
                def={def}
                path={controlPath(group, def)}
                ctx={ctx}
                disabled={disabled}
                disabledReason={disabledReason}
              />
            ))}
        </div>
      )}
    </RegionBoundary>
  );
}
