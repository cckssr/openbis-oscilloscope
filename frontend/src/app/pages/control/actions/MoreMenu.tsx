import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { de } from "../../../../i18n/de";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";

const t = de.control.actions.more;

/** One entry of the "Mehr" overflow menu. */
export interface MoreMenuItem {
  id: string;
  icon: ReactNode;
  label: string;
  /** Explanation under the label; replaced by `reason` while disabled. */
  hint: string;
  /** Why the entry is disabled, or falsy. */
  reason?: string | null;
  onSelect: () => void;
  testId?: string;
}

/**
 * "Mehr ▾" overflow menu of the bottom action bar: keeps the rarely used
 * expert commands (single trigger, force trigger, series) out of the bar so it
 * stays at two rows. Disabled entries show their reason instead of the hint;
 * the whole trigger is disabled when no entry can be used.
 *
 * @param props.items - The entries (an empty list renders nothing)
 * @returns The menu trigger and content
 */
export function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  if (items.length === 0) return null;
  const allDisabled = items.every((i) => !!i.reason);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          disabled={allDisabled}
          aria-label={t.ariaLabel}
          data-testid="more-menu-trigger"
          className="h-11 px-4 coarse:h-12"
        >
          {t.label}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={!!item.reason}
            onSelect={item.onSelect}
            data-testid={item.testId}
            className="items-start gap-2 py-2 coarse:min-h-11"
          >
            <span className="mt-0.5">{item.icon}</span>
            <span className="flex flex-col">
              <span className="font-medium">{item.label}</span>
              <span className="text-xs text-(--lab-text-secondary)">{item.reason ?? item.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
