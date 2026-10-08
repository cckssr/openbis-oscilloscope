import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MeasurementTable } from "../../../components/plot/MeasurementTable";
import { useMediaQuery } from "../../../components/plot/useMediaQuery";
import { RegionBoundary } from "../../../components/common";
import { Button } from "../../../components/ui/button";
import { de } from "../../../../i18n/de";
import type { ControlLevel } from "../../../controls";
import { useDeviceSessionSelector } from "../../../state/deviceSession";

const t = de.control.page.plot;

export interface MeasurementsPanelProps {
  deviceId: string;
  level: ControlLevel;
}

/**
 * Readouts slot: measurement table under the plot. In portrait and on low
 * screens (< 820 px high) it starts collapsed so the plot keeps its height; a
 * toggle shows it.
 *
 * @param props - See {@link MeasurementsPanelProps}
 * @returns The panel
 */
export function MeasurementsPanel({ deviceId, level }: MeasurementsPanelProps) {
  // Only large landscape screens show the table by default; portrait tablets and
  // short landscape heights give the height to the plot.
  const tall = useMediaQuery("(min-height: 820px) and (min-width: 1024px)");
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? tall;
  const traces = useDeviceSessionSelector(deviceId, (s) => s.frame?.traces);

  return (
    <RegionBoundary name={t.measurements} resetKeys={[deviceId]}>
      <div
        className={
          open
            ? "rounded border-2 border-(--lab-border) bg-white p-2"
            : undefined
        }
      >
        {!open && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={false}
            onClick={() => setOverride(true)}
          >
            <ChevronRight aria-hidden />
            {t.showMeasurements}
          </Button>
        )}
        {open && (
          <>
            <MeasurementTable traces={traces ?? []} level={level} />
            <Button
              variant="ghost"
              size="sm"
              className="mt-1"
              aria-expanded
              onClick={() => setOverride(false)}
            >
              <ChevronDown aria-hidden />
              {t.hideMeasurements}
            </Button>
          </>
        )}
      </div>
    </RegionBoundary>
  );
}
