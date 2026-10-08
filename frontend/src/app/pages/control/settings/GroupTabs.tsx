import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { cn } from "../../../components/ui/utils";
import type { ControlGroupDef } from "../../../controls";
import { GroupBody, type GroupBodyProps } from "./GroupBody";

/** From this many groups on, tabs keep their natural width and the list scrolls. */
const MAX_EQUAL_TABS = 4;

export interface GroupLayoutProps extends Omit<GroupBodyProps, "group"> {
  groups: ControlGroupDef[];
  /** Tab selected on mount (default: the first group). */
  initialGroupId?: string;
}

/**
 * Groups as tabs. The tab list scrolls horizontally when there are more than
 * four groups; icons appear only when the container is wide enough.
 *
 * @param props - See {@link GroupLayoutProps}
 * @returns The tabs
 */
export function GroupTabs({
  groups,
  initialGroupId,
  ...body
}: GroupLayoutProps) {
  const [value, setValue] = useState(initialGroupId ?? groups[0]?.id);
  const active = groups.some((g) => g.id === value) ? value : groups[0]?.id;
  const scrolling = groups.length > MAX_EQUAL_TABS;

  return (
    <Tabs value={active} onValueChange={setValue} className="min-w-0 gap-3">
      <TabsList
        className={cn(
          // The baseline is an inset shadow instead of a border, so the triggers sit inside the list and it needs no vertical scrollbar.
          "h-auto w-full justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none bg-transparent p-0 shadow-[inset_0_-2px_0_0_var(--lab-border)]",
        )}
      >
        {groups.map((g) => (
          <TabsTrigger
            key={g.id}
            value={g.id}
            className={cn(
              "tap-target h-auto rounded-none rounded-t border-0 border-b-2 border-transparent px-3 py-1 text-sm shadow-none",
              "data-[state=active]:border-(--lab-accent) data-[state=active]:bg-transparent data-[state=active]:text-(--lab-accent) data-[state=active]:shadow-none",
              scrolling ? "flex-none" : "flex-1",
            )}
          >
            <g.icon className="hidden size-4 @min-[22rem]:block" aria-hidden />
            {g.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {groups.map((g) => (
        <TabsContent key={g.id} value={g.id} className="min-w-0">
          <GroupBody {...body} group={g} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
