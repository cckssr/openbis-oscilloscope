import { Loader2, Save } from "lucide-react";
import { de } from "../../../../i18n/de";
import { DisabledReason } from "../../../components/common";
import { Button } from "../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import { cn } from "../../../components/ui/utils";
import { useAuth } from "../../../context/AuthContext";
import { availability } from "../actions/availability";
import type { ActionLayout } from "../actions/layout";
import { useActionModel, useDeviceActions, useDeviceSessionSelector } from "../actions/session";
import { withShortcut } from "../actions/shortcuts";
import { CaptureMenu } from "./CaptureMenu";
import { useFullResolutionDialog } from "./FullResolutionProvider";
import { showScreenshotToast } from "./screenshotToast";

const t = de.control.actions.capture;

export interface CaptureButtonProps {
  deviceId: string;
  /** column = desktop side column, rail = 72 px tablet icon rail, bar = portrait bottom bar. */
  layout: ActionLayout;
}

const WRAPPER: Record<ActionLayout, string> = {
  column: "flex flex-col gap-1",
  rail: "flex w-[72px] flex-col gap-2",
  bar: "flex flex-col gap-1",
};

const PRIMARY: Record<ActionLayout, string> = {
  column: "min-w-0 flex-1 justify-start rounded-r-none",
  rail: "h-auto min-h-12 w-full flex-col gap-0.5 rounded-b-none px-1 py-1.5 text-[11px] leading-tight whitespace-normal coarse:min-h-[3.25rem]",
  bar: "h-11 rounded-r-none px-6 coarse:h-12",
};

/**
 * The capture split button and the only primary button of the control page:
 * "Aufnahme speichern" (stops live first), plus a ▾ menu with "Volle
 * Auflösung (langsam)…" (opens the page's single full-resolution dialog from
 * {@link FullResolutionProvider}) and
 * "Bildschirmfoto des Oszilloskops" (toast with thumbnail and download).
 * In the column layout a visible helper line explains the button.
 *
 * @param props - See {@link CaptureButtonProps}
 * @returns The split button and its helper text
 */
export function CaptureButton({ deviceId, layout }: CaptureButtonProps) {
  const model = useActionModel(deviceId);
  const actions = useDeviceActions(deviceId);
  const { token } = useAuth();
  const sessionId = useDeviceSessionSelector(
    deviceId,
    (s) => s.lock.sessionId ?? s.lock.previousSessionId,
  );
  const fullResolution = useFullResolutionDialog();

  const av = availability(model);
  if (!av.capture.visible) return null;
  const saving = model.capturing && !model.seriesOn;
  const reason = av.capture.reason;
  const menuDisabled = !!reason && (!av.fullResolution.visible || !!av.fullResolution.reason) &&
    (!av.screenshot.visible || !!av.screenshot.reason);

  const takeScreenshot = async () => {
    const result = await actions.saveScreenshot();
    if (result && token && sessionId) {
      showScreenshotToast({ token, sessionId, artifactId: result.artifactId, deviceId });
    }
  };

  const primary = (
    <Button
      type="button"
      variant="primary"
      disabled={!!reason}
      aria-label={layout === "rail" ? t.save : undefined}
      aria-busy={saving}
      data-testid="capture-save"
      onClick={() => void actions.saveCapture()}
      className={PRIMARY[layout]}
    >
      {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
      <span className={layout === "rail" ? "text-center" : undefined}>
        {saving
          ? layout === "rail" ? t.savingRail : t.saving
          : layout === "rail" ? t.saveRail : t.save}
      </span>
    </Button>
  );

  const group = (
    <div className={cn("flex", layout === "rail" ? "flex-col" : "w-full")}>
      {reason ? primary : (
        <Tooltip>
          <TooltipTrigger asChild>{primary}</TooltipTrigger>
          <TooltipContent side={layout === "column" ? "left" : "bottom"}>
            {withShortcut(t.helper, "capture")}
          </TooltipContent>
        </Tooltip>
      )}
      <CaptureMenu
        layout={layout}
        fullResolution={av.fullResolution}
        screenshot={av.screenshot}
        disabled={menuDisabled}
        onFullResolution={fullResolution.open}
        onScreenshot={() => void takeScreenshot()}
      />
    </div>
  );

  return (
    <div className={WRAPPER[layout]} data-testid="capture-button" data-layout={layout}>
      {reason ? (
        <DisabledReason
          reason={reason}
          className={cn(layout === "rail" && "w-full", layout !== "column" && "[&>p]:hidden!")}
        >
          {group}
        </DisabledReason>
      ) : (
        group
      )}
      {layout === "column" && <p className="help-text">{t.helper}</p>}
    </div>
  );
}
