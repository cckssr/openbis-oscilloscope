import { de } from "../../../../i18n/de";
import { cn } from "../../../components/ui/utils";
import type { InspectorGroupInfo } from "./slots";

const t = de.control.page.layout;

export interface InspectorRailProps {
  groups: InspectorGroupInfo[];
  /** Called with the tapped group's id; the page opens the settings sheet on it. */
  onSelect: (groupId: string) => void;
}

/**
 * Slim vertical rail with one icon button per settings group (Kanäle,
 * Horizontal, Trigger …) for the landscape tablet layout.
 *
 * @param props - See {@link InspectorRailProps}
 * @returns The rail
 */
export function InspectorRail({ groups, onSelect }: InspectorRailProps) {
  return (
    <nav
      aria-label={t.inspectorRail}
      className="flex h-full w-16 flex-col items-stretch gap-1 border-l-2 border-(--lab-border) bg-white p-1"
    >
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onSelect(g.id)}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded px-0.5 text-[11px] leading-tight font-medium",
            "text-(--lab-text-secondary) hover:bg-(--lab-panel) hover:text-(--lab-text-primary)",
          )}
        >
          <g.icon className="size-5" aria-hidden />
          <span className="max-w-full truncate">{g.label}</span>
        </button>
      ))}
    </nav>
  );
}
