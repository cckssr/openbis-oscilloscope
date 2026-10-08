import { useState } from "react";
import { WaveformPlot } from "../../../components/plot/WaveformPlot";
import { ExportMenu } from "../../../components/plot/ExportMenu";
import { RegionBoundary } from "../../../components/common";
import { de } from "../../../../i18n/de";
import { useAuth } from "../../../context/AuthContext";
import { LiveStatusBadge } from "../status";
import { useWorkflow } from "../workflow";
import { SavingOverlay } from "./SavingOverlay";
import { usePlotModel } from "./usePlotModel";

const t = de.control.page.plot;

/**
 * Plot slot: waveform plot with overlays from applied settings, the live badge
 * and export menu in its toolbar, the "Als Nächstes" hint when empty and a
 * dimmed "Wird gespeichert…" overlay during saves. Zoom persists across live
 * frames and resets when the device changes (`viewKey`).
 *
 * @param props.deviceId - The device
 * @returns The plot region
 */
export function PlotRegion({ deviceId }: { deviceId: string }) {
  const { token } = useAuth();
  const model = usePlotModel(deviceId);
  const { next } = useWorkflow(deviceId);
  const [plotElement, setPlotElement] = useState<HTMLElement | null>(null);
  const { frame, shownCapture } = model;

  const toolbarExtras = (
    <>
      <LiveStatusBadge deviceId={deviceId} />
      <ExportMenu
        input={{
          traces: frame?.traces,
          plotElement,
          baseName: t.exportName(deviceId, shownCapture?.number ?? null),
          ...(shownCapture && token && model.sessionId
            ? { token, sessionId: model.sessionId, artifactIds: shownCapture.artifactIds }
            : {}),
        }}
      />
    </>
  );

  return (
    <RegionBoundary name={t.region} resetKeys={[deviceId]} className="h-full">
      <div className="relative h-full min-h-0">
        <WaveformPlot
          traces={frame?.traces ?? []}
          overlays={model.overlays}
          timebase={frame?.timebase}
          viewKey={deviceId}
          showReadouts
          memoryDepth={model.memoryDepth}
          toolbarExtras={toolbarExtras}
          onPlotElement={setPlotElement}
          emptyMessage={<span data-testid="plot-empty-hint">{next}</span>}
          className="h-full"
        />
        {model.saving && <SavingOverlay />}
      </div>
    </RegionBoundary>
  );
}
