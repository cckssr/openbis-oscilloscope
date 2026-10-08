import type { ReactNode } from "react";
import { cn } from "../../../components/ui/utils";

/**
 * Plot with the measurement table underneath; shared by the desktop and
 * landscape layouts. The plot takes all remaining height.
 *
 * @param props.plot - Plot slot
 * @param props.readouts - Measurements slot
 * @returns The column
 */
export function CenterColumn({
  plot,
  readouts,
  className,
}: {
  plot: ReactNode;
  readouts: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col gap-2 p-2",
        className,
      )}
    >
      <div className="min-h-0 flex-1">{plot}</div>
      <div className="max-h-[40%] shrink-0 overflow-y-auto">{readouts}</div>
    </div>
  );
}
