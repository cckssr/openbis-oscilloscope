import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../../components/ui/sheet";
import { cn } from "../../../components/ui/utils";

export interface ContentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "left" | "right" | "bottom";
  title: string;
  description: string;
  children: ReactNode;
}

const SIDE_CLASS = {
  right: "w-[400px] max-w-[92vw] sm:max-w-[400px]",
  left: "w-[360px] max-w-[92vw] sm:max-w-[360px]",
  bottom: "max-h-[75dvh]",
} as const;

/**
 * Sheet used by the tablet layouts for settings (right or bottom) and the
 * last-capture card (left or bottom). The body scrolls.
 *
 * @param props - See {@link ContentSheetProps}
 * @returns The sheet
 */
export function ContentSheet({
  open,
  onOpenChange,
  side,
  title,
  description,
  children,
}: ContentSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn("gap-0 p-0", SIDE_CLASS[side])}
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b-2 border-(--lab-border) py-3 pr-14 pl-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="help-text">
            {description}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
