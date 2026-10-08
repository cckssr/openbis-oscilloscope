import { useMemo, useState } from "react";
import { Link } from "react-router";
import { de } from "../../../i18n/de";
import { EmptyState, PageHeader, RegionBoundary } from "../../components/common";
import { Button } from "../../components/ui/button";
import { SettingsInspector } from "./settings";
import { useDeviceSessionSelector } from "../../state/deviceSession";
import { LiveControls, useControlShortcuts } from "./actions";
import { useDeviceActions } from "./actions/session";
import { ControlBanners } from "./banners";
import { CaptureButton, FullResolutionDialog, LastCaptureCard } from "./capture";
import { ControlHeader } from "./header";
import { ControlLayout, useBreakpoint, type ControlSlots } from "./layout";
import { MeasurementsPanel, PlotRegion } from "./plot";
import { StatusBar } from "./status";
import { useControlLevel } from "./useControlLevel";
import { useControlLifecycle } from "./useControlLifecycle";
import { useInspectorGroups } from "./useInspectorGroups";
import { WorkflowStepper } from "./workflow";

const t = de.control.page;

/** Lock-dependent settings state: editable only while this tab controls the device. */
function useInspectorAccess(deviceId: string) {
  const status = useDeviceSessionSelector(deviceId, (s) => s.lock.status);
  const reason =
    status === "passive" ? t.inspector.passive : status === "lost" ? t.inspector.lost : undefined;
  return { canEdit: status === "held", readOnlyReason: reason };
}

/**
 * Control page of one device. Only composes the named slots (header, stepper,
 * banners, actions, plot, readouts, inspector, status bar); `ControlLayout`
 * decides where they go per breakpoint, and all state lives in the device
 * session store.
 *
 * @param props.deviceId - The device (route parameter)
 * @returns The page
 */
export function ControlPage({ deviceId }: { deviceId: string }) {
  const [level, setLevel] = useControlLevel();
  const actions = useDeviceActions(deviceId);
  const breakpoint = useBreakpoint();
  const device = useDeviceSessionSelector(deviceId, (s) => s.device);
  const deviceError = useDeviceSessionSelector(deviceId, (s) => s.deviceError);
  const access = useInspectorAccess(deviceId);
  const groups = useInspectorGroups(deviceId, level);
  const [fullResolutionOpen, setFullResolutionOpen] = useState(false);

  useControlLifecycle(deviceId, device?.label);
  useControlShortcuts(deviceId, { onOpenFullResolution: () => setFullResolutionOpen(true) });

  const slots = useMemo<ControlSlots>(
    () => ({
      header: <ControlHeader deviceId={deviceId} level={level} onLevelChange={setLevel} />,
      banners: <ControlBanners deviceId={deviceId} />,
      stepper: <WorkflowStepper deviceId={deviceId} compact={breakpoint !== "desktop"} />,
      plot: <PlotRegion deviceId={deviceId} />,
      readouts: <MeasurementsPanel deviceId={deviceId} level={level} />,
      statusbar: <StatusBar deviceId={deviceId} />,
      actions: (layout, extras) => (
        <RegionBoundary name={t.plot.actionsRegion} resetKeys={[deviceId]}>
          <div className={layout === "bar" ? "contents" : "flex flex-col gap-3"}>
            <CaptureButton deviceId={deviceId} layout={layout} />
            {extras}
            <LiveControls deviceId={deviceId} level={level} layout={layout} />
          </div>
        </RegionBoundary>
      ),
      inspector: ({ layout, initialGroupId }) => (
        <RegionBoundary name={t.plot.inspectorRegion} resetKeys={[deviceId]}>
          <SettingsInspector
            deviceId={deviceId}
            level={level}
            layout={layout}
            initialGroupId={initialGroupId}
            canEdit={access.canEdit}
            readOnlyReason={access.readOnlyReason}
            onTakeControl={() => void actions.takeControl()}
          />
        </RegionBoundary>
      ),
      lastCapture: (layout) => <LastCaptureCard deviceId={deviceId} layout={layout} />,
    }),
    [deviceId, level, setLevel, breakpoint, access.canEdit, access.readOnlyReason, actions],
  );

  if (deviceError && !device) {
    return (
      <div className="min-h-dvh bg-(--lab-bg)">
        <PageHeader title={deviceId} backTo="/" backLabel={t.header.back} />
        <EmptyState
          title={t.banners.loadFailedTitle}
          description={
            <>
              {deviceError}
              <br />
              {t.banners.loadFailedHint}
            </>
          }
          action={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => void actions.refreshDevice()}>
                {de.common.actions.retry}
              </Button>
              <Button asChild variant="secondary">
                <Link to="/">{t.header.back}</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <>
      <ControlLayout slots={slots} groups={groups} breakpoint={breakpoint} />
      <FullResolutionDialog deviceId={deviceId} open={fullResolutionOpen} onOpenChange={setFullResolutionOpen} />
    </>
  );
}
