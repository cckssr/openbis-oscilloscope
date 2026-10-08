import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../../components/ui/accordion";
import { GroupBody } from "./GroupBody";
import type { GroupLayoutProps } from "./GroupTabs";

/**
 * Groups as an accordion (narrow sheets): each header shows the group's
 * one-line summary, the first group starts open.
 *
 * @param props - See {@link GroupLayoutProps}
 * @returns The accordion
 */
export function GroupAccordion({ groups, ...body }: GroupLayoutProps) {
  return (
    <Accordion type="multiple" defaultValue={groups[0] ? [groups[0].id] : []}>
      {groups.map((g) => (
        <AccordionItem key={g.id} value={g.id}>
          <AccordionTrigger className="tap-target items-center py-3 hover:no-underline coarse:text-base">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <g.icon className="size-4 shrink-0" aria-hidden />
                {g.label}
              </span>
              {g.summary && (
                <span className="help-text break-words font-normal">
                  {g.summary(body.ctx)}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <GroupBody {...body} group={g} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
