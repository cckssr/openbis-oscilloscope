import { de } from "../../../../i18n/de";
import { HelpPopover } from "../../../components/common";
import { SegmentedControl } from "../../../components/SegmentedControl";
import type { ControlLevel } from "../../../controls";

const t = de.control.page.level;

export interface LevelToggleProps {
  level: ControlLevel;
  onChange: (level: ControlLevel) => void;
}

/**
 * "Einfach | Erweitert" segmented toggle with a tap-friendly help popover.
 *
 * @param props - See {@link LevelToggleProps}
 * @returns The toggle
 */
export function LevelToggle({ level, onChange }: LevelToggleProps) {
  return (
    <div className="flex items-center gap-1">
      <SegmentedControl
        aria-label={t.ariaLabel}
        size="button"
        value={level}
        onChange={(v) => onChange(v as ControlLevel)}
        options={[
          { value: "basic", label: t.basic },
          { value: "expert", label: t.expert },
        ]}
      />
      <HelpPopover label={t.helpLabel} title={t.helpTitle}>
        <p>{t.helpBasic}</p>
        <p className="mt-1">{t.helpExpert}</p>
      </HelpPopover>
    </div>
  );
}
