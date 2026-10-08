import { useEffect, useState } from "react";
import { Download, ImageOff, X } from "lucide-react";
import { toast } from "sonner";
import { fetchArtifactScreenshot } from "../../../../api/sessions";
import { de } from "../../../../i18n/de";
import { downloadBlob } from "../../../../lib/download";
import { notifyError } from "../../../../lib/notify";
import { Button } from "../../../components/ui/button";

const t = de.control.actions.screenshot;

export interface ScreenshotToastTarget {
  token: string;
  /** Control session whose archive holds the screenshot. */
  sessionId: string;
  artifactId: string;
  deviceId: string;
}

/**
 * Builds the download file name, e.g. `bildschirmfoto_scope-01_20261008-140211.png`.
 * @param deviceId - The device
 * @param date - Time of the screenshot
 * @returns The file name
 */
export function screenshotFilename(
  deviceId: string,
  date = new Date(),
): string {
  const iso = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  return t.filename(deviceId, iso);
}

function ScreenshotToastBody({
  target,
  onClose,
}: {
  target: ScreenshotToastTarget;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // The image comes from the archive (already stored on the server): no second device round-trip.
  useEffect(() => {
    let cancelled = false;
    fetchArtifactScreenshot(target.token, target.sessionId, target.artifactId)
      .then((b) => {
        if (cancelled) return;
        setBlob(b);
        const reader = new FileReader();
        reader.onload = () => {
          if (!cancelled) setUrl(reader.result as string);
        };
        reader.readAsDataURL(b);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [target.token, target.sessionId, target.artifactId]);

  const download = async () => {
    try {
      const data =
        blob ??
        (await fetchArtifactScreenshot(
          target.token,
          target.sessionId,
          target.artifactId,
        ));
      downloadBlob(data, screenshotFilename(target.deviceId));
    } catch (err) {
      notifyError(err, t.downloadFailed, t.downloadFailedTitle);
    }
  };

  return (
    <div
      className="flex w-[356px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-(--lab-border) bg-white p-3 shadow-lg"
      data-testid="screenshot-toast"
    >
      <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-(--lab-border) bg-(--lab-panel)">
        {url ? (
          <img src={url} alt={t.alt} className="size-full object-cover" />
        ) : failed ? (
          <ImageOff
            className="size-5 text-(--lab-text-secondary)"
            aria-label={t.thumbnailFailed}
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <p className="text-sm font-medium text-(--lab-text-primary)">
          {t.saved}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void download()}
        >
          <Download aria-hidden />
          {t.download}
        </Button>
      </div>
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="self-start rounded p-1 text-(--lab-text-secondary) hover:bg-(--lab-panel) coarse:p-2.5"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Shows the "Bildschirmfoto gespeichert" toast with a thumbnail and a
 * "Herunterladen" action. Nothing is downloaded automatically.
 *
 * @param target - Where the screenshot lives in the archive
 */
export function showScreenshotToast(target: ScreenshotToastTarget): void {
  toast.custom(
    (id) => (
      <ScreenshotToastBody target={target} onClose={() => toast.dismiss(id)} />
    ),
    {
      duration: 12_000,
    },
  );
}
