/**
 * Archive page `/archive/:sessionId` ("Messdaten"): one timeline of captures
 * with upload selection, preview (split view or dialog) and the upload wizard.
 */
import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Inbox } from "lucide-react";
import { downloadArtifactsZip } from "../../api/sessions";
import { de } from "../../i18n/de";
import { downloadBlob, safeFilename } from "../../lib/download";
import { notifyError } from "../../lib/notify";
import { formatDate } from "../../lib/units";
import { EmptyState, RegionBoundary } from "../components/common";
import { Button } from "../components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { UploadWizard } from "../components/upload/UploadWizard";
import { useAuth } from "../context/AuthContext";
import { ArchiveHeader } from "./archive/ArchiveHeader";
import { ArchiveSkeleton } from "./archive/ArchiveSkeleton";
import { ArchiveTable } from "./archive/ArchiveTable";
import { CapturePreview } from "./archive/CapturePreview";
import { buildTimeline, countByStatus, selectableCaptures } from "./archive/groupArtifacts";
import { PreviewDialog } from "./archive/PreviewDialog";
import { PreviewPlaceholder } from "./archive/PreviewPlaceholder";
import { useArchive } from "./archive/useArchive";
import { useMediaQuery } from "./archive/useMediaQuery";
import { usePreviewKeys } from "./archive/usePreviewKeys";
import { useScreenshotUrls } from "./archive/useScreenshotUrls";
import { useSessionInfo } from "./archive/useSessionInfo";

const t = de.archive;

/** From this width the preview sits next to the list instead of in a dialog. */
const SPLIT_QUERY = "(min-width: 1280px)";

/** Preview panel width (px) in the split view; the divider moves it between min and max. */
const PREVIEW_DEFAULT_WIDTH = 560;
const PREVIEW_MIN_WIDTH = 360;
const PREVIEW_MAX_WIDTH = 900;

/**
 * The archive page.
 * @returns The page for the session in the route
 */
export function DataArchive() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { token } = useAuth();
  const wide = useMediaQuery(SPLIT_QUERY);

  const { artifacts, isLoading, isRefreshing, refresh, setUploadSelection, saveNote } = useArchive(
    token,
    sessionId,
  );
  const info = useSessionInfo(token, sessionId);
  const screenshotUrls = useScreenshotUrls(token, sessionId, artifacts);

  const timeline = useMemo(() => buildTimeline(artifacts), [artifacts]);
  const counts = useMemo(() => countByStatus(timeline.captures), [timeline.captures]);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  const previewIndex = timeline.captures.findIndex((c) => c.id === previewId);
  const previewCapture = previewIndex >= 0 ? timeline.captures[previewIndex] : null;

  // Opening a capture also expands its series, so the highlighted row stays visible.
  const openPreview = useCallback(
    (id: string | null) => {
      setPreviewId(id);
      const runId = timeline.captures.find((c) => c.id === id)?.runId;
      if (runId) setExpandedRuns((prev) => (prev.has(runId) ? prev : new Set(prev).add(runId)));
    },
    [timeline.captures],
  );

  const step = useCallback(
    (delta: number) => {
      const next = timeline.captures[previewIndex + delta];
      if (next) openPreview(next.id);
    },
    [timeline.captures, previewIndex, openPreview],
  );
  usePreviewKeys(previewCapture != null && !wizardOpen, {
    onPrev: () => step(-1),
    onNext: () => step(1),
    onEscape: wide ? () => openPreview(null) : undefined,
  });

  const toggleRun = (runId: string) =>
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (!next.delete(runId)) next.add(runId);
      return next;
    });

  const selectedCaptures = useMemo(
    () => timeline.captures.filter((c) => c.status === "selected"),
    [timeline.captures],
  );
  const selectableAll = useMemo(() => selectableCaptures(timeline.captures), [timeline.captures]);
  const withNote = useMemo(() => selectableAll.filter((c) => (c.annotation ?? "").trim() !== ""), [selectableAll]);

  const deviceLabel = info?.device_label ?? info?.device_id;
  const baseName = safeFilename(`messdaten_${info?.device_id ?? sessionId?.slice(0, 8) ?? "sitzung"}`);
  const subtitle = [
    deviceLabel ?? `${t.sessionFallback} ${sessionId?.slice(0, 8) ?? ""}`,
    info ? formatDate(info.created_at) : null,
    t.summary.captures(timeline.captures.length),
  ]
    .filter(Boolean)
    .join(" · ");
  const backToDevice = info?.is_active === true;

  const downloadAll = async () => {
    if (!token || !sessionId) return;
    setZipBusy(true);
    try {
      // No artifact ids = the whole session, built on the server without a client-side cap.
      const blob = await downloadArtifactsZip(token, sessionId, []);
      downloadBlob(blob, `${baseName}.zip`);
    } catch (err) {
      notifyError(err, t.export.error, t.export.error);
    } finally {
      setZipBusy(false);
    }
  };

  const hasData = timeline.captures.length > 0;
  const previewProps =
    previewCapture && token && sessionId
      ? {
          capture: previewCapture,
          index: previewIndex,
          total: timeline.captures.length,
          token,
          sessionId,
          screenshotUrl: screenshotUrls[previewCapture.artifactIds[0]],
          baseName,
          onPrev: () => step(-1),
          onNext: () => step(1),
        }
      : null;

  const list = (
    <main className="h-full min-w-0 flex-1 overflow-auto">
      <RegionBoundary name="Messdaten" resetKeys={[sessionId]}>
        {isLoading ? (
          <ArchiveSkeleton />
        ) : !hasData ? (
          <EmptyState
            icon={<Inbox />}
            title={t.empty.title}
            description={t.empty.text}
            action={
              backToDevice && info ? (
                <Button asChild variant="secondary">
                  <Link to={`/device/${info.device_id}`}>{t.back.toDevice}</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ArchiveTable
            timeline={timeline}
            activeId={previewCapture?.id ?? null}
            expandedRuns={expandedRuns}
            screenshotUrls={screenshotUrls}
            onToggleRun={toggleRun}
            onPreview={openPreview}
            onToggleUpload={(captures, wanted) => void setUploadSelection(captures, wanted)}
            onSaveNote={(capture, text) => void saveNote(capture, text)}
          />
        )}
      </RegionBoundary>
    </main>
  );

  const preview = (
    <aside
      aria-label={t.preview.title}
      className="flex h-full flex-col overflow-auto border-l-2 border-(--lab-border) bg-white p-4"
    >
      <RegionBoundary name="Vorschau" resetKeys={[previewId]}>
        {previewProps ? (
          <CapturePreview {...previewProps} onClose={() => setPreviewId(null)} className="flex-1" />
        ) : (
          <PreviewPlaceholder />
        )}
      </RegionBoundary>
    </aside>
  );

  return (
    <div className="flex h-dvh flex-col bg-(--lab-bg)">
      <ArchiveHeader
        title={t.title}
        subtitle={subtitle}
        backTo={backToDevice && info ? `/device/${info.device_id}` : "/sessions"}
        backLabel={backToDevice ? t.back.toDevice : t.back.toSessions}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh()}
        selectionExport={{
          token: token ?? undefined,
          sessionId,
          artifactIds: selectedCaptures.flatMap((c) => c.artifactIds),
          baseName,
        }}
        zipBusy={zipBusy}
        onDownloadAll={() => void downloadAll()}
        uploadCount={selectedCaptures.length}
        onUpload={() => setWizardOpen(true)}
      />

      {hasData && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-(--lab-border) bg-(--lab-panel) px-4 py-2 text-sm sm:px-6">
          <span className="font-medium text-(--lab-text-primary)" aria-live="polite">
            {counts.selected > 0 ? t.summary.selected(counts.selected) : t.summary.none}
          </span>
          {counts.uploaded > 0 && (
            <span className="text-(--lab-text-secondary)">{t.summary.uploaded(counts.uploaded)}</span>
          )}
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            disabled={selectableAll.length === 0 || counts.selected === selectableAll.length}
            onClick={() => void setUploadSelection(selectableAll, true)}
          >
            {t.select.all}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title={t.select.withNoteTitle}
            disabled={withNote.length === 0 || withNote.every((c) => c.status === "selected")}
            onClick={() => void setUploadSelection(withNote, true)}
          >
            {t.select.withNote}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={counts.selected === 0}
            onClick={() => void setUploadSelection(selectedCaptures, false)}
          >
            {t.select.clear}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {wide && hasData ? (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel id="archive-list" minSize={400}>
              {list}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="archive-preview"
              defaultSize={PREVIEW_DEFAULT_WIDTH}
              minSize={PREVIEW_MIN_WIDTH}
              maxSize={PREVIEW_MAX_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
            >
              {preview}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          list
        )}
      </div>

      {!wide && previewProps && (
        <PreviewDialog {...previewProps} onClose={() => setPreviewId(null)} />
      )}

      {token && sessionId && (
        <UploadWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          captures={selectedCaptures}
          token={token}
          sessionId={sessionId}
          screenshotUrls={screenshotUrls}
          onUploaded={() => void refresh()}
        />
      )}
    </div>
  );
}
