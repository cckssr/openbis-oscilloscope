/**
 * Saved captures ("Aufnahmen"): single capture, full resolution with progress
 * and cancel, screenshot, series, notes / upload selection and archive counts.
 *
 * A capture always stops live first, uses the *applied* enabled channels and
 * returns the samples inline (`includeData`). The note belongs to
 * `lastCapture` only — live frames never touch it (A4).
 */
import { ApiError } from "../../../api/client";
import {
  acquireWaveforms,
  cancelAcquire,
  saveScreenshot as apiSaveScreenshot,
} from "../../../api/devices";
import { subscribeDeviceEvents } from "../../../api/events";
import {
  flagArtifact,
  getArtifactWaveform,
  listArtifacts,
  setAnnotation,
} from "../../../api/sessions";
import type { Artifact } from "../../../api/types";
import { de } from "../../../i18n/de";
import { errorMessage, notifyError, notifySuccess } from "../../../lib/notify";
import { formatPoints } from "../../../lib/units";
import { countsFromArtifacts, countsWithNewCapture } from "./captureCounts";
import type { CommandQueue } from "./commandQueue";
import {
  archiveSessionId,
  cancellableSleep,
  DisposedError,
  requireControl,
  uid,
  type CancellableSleep,
  type StoreHost,
} from "./context";
import { enabledChannels, frameFromAcquire, frameFromArchive } from "./frames";
import type { JobTracker } from "./jobs";
import type { Capture } from "./types";

const t = de.control.session;

/** Time between two captures of a series. */
export const SERIES_PERIOD_MS = 1000;

export interface CaptureControllerDeps {
  /** Ends the live loop and waits for the in-flight frame. */
  stopLive(): Promise<void>;
}

interface CaptureOptions {
  fullResolution: boolean;
  runId?: string;
  /** Suppress the success toast (series). */
  silent?: boolean;
}

export class CaptureController {
  private capturing = false;
  private fullResolutionJob: string | null = null;
  private cancelRequested = false;
  private seriesLoop: Promise<void> = Promise.resolve();
  private seriesSleep: CancellableSleep | null = null;

  constructor(
    private readonly host: StoreHost,
    private readonly queue: CommandQueue,
    private readonly jobs: JobTracker,
    private readonly deps: CaptureControllerDeps,
  ) {}

  // -------------------------------------------------------------------------
  // Captures
  // -------------------------------------------------------------------------

  /**
   * "Aufnahme speichern": stops live, saves one capture and shows it.
   * @returns The new capture, or null when it failed (a toast explains why)
   */
  saveCapture(): Promise<Capture | null> {
    return this.capture({ fullResolution: false });
  }

  /**
   * Full-memory capture with progress events and cancel.
   * @returns The new capture, or null when it failed or was cancelled
   */
  saveFullResolution(): Promise<Capture | null> {
    return this.capture({ fullResolution: true });
  }

  /**
   * Asks the backend to abort the running full-resolution read. The running
   * `saveFullResolution` then ends as a cancelled job and stores nothing.
   * @returns A promise that resolves when the backend answered
   */
  async cancelFullResolution(): Promise<void> {
    const jobId = this.fullResolutionJob;
    const sessionId = this.host.getState().lock.sessionId;
    if (!jobId || !sessionId) return;
    this.cancelRequested = true;
    this.jobs.update(jobId, { detail: t.jobs.cancelling, cancellable: false });
    try {
      await cancelAcquire(this.host.token, this.host.deviceId, sessionId);
    } catch (err) {
      this.cancelRequested = false;
      this.jobs.update(jobId, { cancellable: true });
      notifyError(err, t.toast.cancelFailed, t.toast.cancelFailedTitle);
    }
  }

  private async capture(options: CaptureOptions): Promise<Capture | null> {
    const sessionId = requireControl(this.host);
    if (!sessionId || this.capturing) return null;
    this.capturing = true;
    try {
      await this.deps.stopLive();
      if (this.host.isDisposed()) return null;

      const applied = this.host.getState().settings.applied;
      const channels = enabledChannels(applied);
      if (channels && channels.length === 0) {
        notifyError(new Error(t.toast.noChannel), t.toast.noChannel, t.toast.captureFailedTitle);
        return null;
      }
      return await this.runCapture(sessionId, channels, options);
    } finally {
      this.capturing = false;
    }
  }

  private async runCapture(
    sessionId: string,
    channels: number[] | undefined,
    { fullResolution, runId, silent }: CaptureOptions,
  ): Promise<Capture | null> {
    const label = fullResolution ? t.jobs.fullResolution : t.jobs.capture;
    const jobId = this.jobs.start(fullResolution ? "full-resolution" : "capture", label, {
      cancellable: fullResolution,
    });
    let unsubscribe: (() => void) | null = null;
    if (fullResolution) {
      this.fullResolutionJob = jobId;
      this.cancelRequested = false;
      unsubscribe = subscribeDeviceEvents(this.host.token, (event) => {
        if (
          event.type === "progress" &&
          event.device_id === this.host.deviceId &&
          event.session_id === sessionId
        ) {
          this.jobs.update(jobId, { progress: event.done, detail: event.detail });
        }
      });
    }

    try {
      const resp = await this.queue.run(
        fullResolution ? t.busy.fullResolution : t.busy.capture,
        () => {
          // Cancel was pressed while the read still waited in the queue.
          if (this.cancelRequested) {
            throw new ApiError(409, "acquisition_cancelled", "cancelled");
          }
          return acquireWaveforms(this.host.token, this.host.deviceId, sessionId, {
            channels,
            maxSamples: fullResolution,
            runId,
            includeData: true,
          });
        },
      );
      if (this.host.isDisposed()) return null;

      const frame = frameFromAcquire(resp, this.host.now());
      const number = this.host.getState().counts.total + 1;
      const capture: Capture = {
        acquisitionId: resp.acquisition_id,
        artifactIds: resp.artifact_ids,
        createdAt: resp.created_at,
        number,
        fullResolution,
        frame,
        note: "",
        flagged: false,
        ...(silent ? {} : { fresh: true }),
      };
      this.host.update((s) => ({
        ...s,
        frame,
        lastCapture: capture,
        counts: countsWithNewCapture(s.counts),
      }));
      this.jobs.finish(jobId, "done");
      if (!silent) {
        notifySuccess(
          t.toast.captureSaved(number),
          fullResolution ? t.toast.points(formatPoints(frame.memoryDepth)) : undefined,
        );
      }
      void this.loadCounts(false);
      return capture;
    } catch (err) {
      if (err instanceof DisposedError || this.host.isDisposed()) return null;
      if (err instanceof ApiError && err.code === "acquisition_cancelled") {
        this.jobs.finish(jobId, "cancelled");
        return null;
      }
      this.jobs.finish(jobId, "error", errorMessage(err, t.toast.captureFailed));
      notifyError(err, t.toast.captureFailed, t.toast.captureFailedTitle);
      return null;
    } finally {
      unsubscribe?.();
      if (this.fullResolutionJob === jobId) {
        this.fullResolutionJob = null;
        this.cancelRequested = false;
      }
    }
  }

  /**
   * Saves a screenshot of the scope display to the archive.
   * @returns The artifact id, or null when it failed (a toast explains why)
   */
  async saveScreenshot(): Promise<{ artifactId: string } | null> {
    const sessionId = requireControl(this.host);
    if (!sessionId) return null;
    const jobId = this.jobs.start("screenshot", t.jobs.screenshot);
    try {
      const res = await this.queue.run(t.busy.screenshot, () =>
        apiSaveScreenshot(this.host.token, this.host.deviceId, sessionId),
      );
      // The UI shows its own toast with a thumbnail and download action.
      this.jobs.finish(jobId, "done");
      void this.loadCounts(false);
      return { artifactId: res.artifact_id };
    } catch (err) {
      if (err instanceof DisposedError) return null;
      this.jobs.finish(jobId, "error", errorMessage(err, t.toast.screenshotFailed));
      notifyError(err, t.toast.screenshotFailed, t.toast.screenshotFailedTitle);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Series
  // -------------------------------------------------------------------------

  /** Saves a capture about once per second until {@link stopSeries}. */
  startSeries(): void {
    if (this.host.getState().series.status === "on") return;
    if (!requireControl(this.host) || this.capturing) return;
    const runId = uid();
    this.host.update((s) => ({ ...s, series: { status: "on", runId, count: 0 } }));
    const jobId = this.jobs.start("series", t.jobs.series, { cancellable: false });
    this.seriesLoop = this.runSeries(runId, jobId);
  }

  /**
   * Ends a running series; resolves after the capture in flight finished.
   * @returns A promise that resolves when the series loop has ended
   */
  async stopSeries(): Promise<void> {
    if (this.host.getState().series.status === "on") {
      this.host.update((s) => ({ ...s, series: { ...s.series, status: "off" } }));
    }
    this.seriesSleep?.cancel();
    await this.seriesLoop;
  }

  private async runSeries(runId: string, jobId: string): Promise<void> {
    await this.deps.stopLive();
    const isCurrent = () => {
      const { series, lock } = this.host.getState();
      return !this.host.isDisposed() && series.status === "on" && series.runId === runId && lock.status === "held";
    };
    try {
      while (isCurrent()) {
        const startedAt = this.host.now();
        if (!this.capturing) {
          const capture = await this.capture({ fullResolution: false, runId, silent: true });
          if (!isCurrent()) break;
          if (!capture) {
            this.host.update((s) => ({ ...s, series: { ...s.series, status: "off" } }));
            break;
          }
          this.host.update((s) => ({ ...s, series: { ...s.series, count: s.series.count + 1 } }));
          this.jobs.update(jobId, { detail: t.jobs.seriesCount(this.host.getState().series.count) });
        }
        this.seriesSleep = cancellableSleep(
          Math.max(0, SERIES_PERIOD_MS - (this.host.now() - startedAt)),
        );
        await this.seriesSleep.promise;
      }
    } finally {
      if (!this.host.isDisposed()) {
        const stillOn = this.host.getState().series.runId === runId && this.host.getState().series.status === "on";
        if (stillOn) this.host.update((s) => ({ ...s, series: { ...s.series, status: "off" } }));
        this.jobs.finish(jobId, "done");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Notes, upload selection, counts
  // -------------------------------------------------------------------------

  /**
   * Stores the note of the last capture, optionally selecting it for upload.
   * @param text - Note text
   * @param flag - true also selects the capture for upload
   * @returns A promise that resolves when stored (or failed with a toast)
   */
  async saveNote(text: string, flag?: boolean): Promise<void> {
    const state = this.host.getState();
    const capture = state.lastCapture;
    const sessionId = archiveSessionId(state);
    if (!capture || !sessionId) {
      notifyError(new Error(t.toast.noCapture), t.toast.noCapture, t.toast.noteFailedTitle);
      return;
    }
    try {
      await setAnnotation(this.host.token, sessionId, capture.acquisitionId, text);
      if (flag === true) await this.flagAll(sessionId, capture, true);
    } catch (err) {
      if (!this.host.isDisposed()) notifyError(err, t.toast.noteFailed, t.toast.noteFailedTitle);
      return;
    }
    this.patchLastCapture(capture.acquisitionId, {
      note: text,
      ...(flag === true ? { flagged: true } : {}),
    });
    void this.loadCounts(false);
  }

  /**
   * Selects or deselects the last capture for upload.
   * @param flagged - true to select
   * @returns A promise that resolves when stored (or failed with a toast)
   */
  async setCaptureFlag(flagged: boolean): Promise<void> {
    const state = this.host.getState();
    const capture = state.lastCapture;
    const sessionId = archiveSessionId(state);
    if (!capture || !sessionId) return;
    try {
      await this.flagAll(sessionId, capture, flagged);
    } catch (err) {
      if (!this.host.isDisposed()) notifyError(err, t.toast.flagFailed, t.toast.flagFailedTitle);
      return;
    }
    this.patchLastCapture(capture.acquisitionId, { flagged });
    void this.loadCounts(false);
  }

  /**
   * Re-counts the captures from the archive (after uploads elsewhere).
   * @returns A promise that resolves when the counts are updated
   */
  async refreshCounts(): Promise<void> {
    await this.loadCounts(true);
  }

  /**
   * Reads the archive and updates `counts`.
   * @param notify - Toast on failure (explicit refresh) or stay silent (background)
   * @returns The artifacts, or null when the archive could not be read
   */
  async loadCounts(notify: boolean): Promise<Artifact[] | null> {
    const sessionId = archiveSessionId(this.host.getState());
    if (!sessionId) return null;
    try {
      const artifacts = await listArtifacts(this.host.token, sessionId);
      if (this.host.isDisposed() || archiveSessionId(this.host.getState()) !== sessionId) {
        return null;
      }
      const counts = countsFromArtifacts(artifacts);
      this.host.update((s) => {
        // The last open capture was uploaded: the workflow starts over at "Signal einstellen".
        const roundDone = counts.total > 0 && counts.notUploaded === 0 && s.counts.notUploaded > 0;
        return roundDone
          ? { ...s, counts, settings: { ...s.settings, touched: false } }
          : { ...s, counts };
      });
      return artifacts;
    } catch (err) {
      if (notify && !this.host.isDisposed()) {
        notifyError(err, t.toast.countsFailed, t.toast.countsFailedTitle);
      }
      return null;
    }
  }

  /**
   * After a reload (reclaimed lock) shows the newest capture of the session
   * again: `lastCapture` from the archive plus its waveforms as `frame`. If the
   * waveforms cannot be loaded `lastCapture` is kept with an empty frame and
   * `frame` stays null. Does
   * nothing when there already is a last capture.
   * @param artifacts - Archive listing of the session
   * @returns A promise that resolves when restored (never rejects)
   */
  async restoreLastCapture(artifacts: Artifact[]): Promise<void> {
    const state = this.host.getState();
    const sessionId = archiveSessionId(state);
    if (state.lastCapture || !sessionId) return;
    const traces = artifacts.filter((a) => a.artifact_type === "trace" && a.acquisition_id);
    if (traces.length === 0) return;
    const newest = traces.reduce((a, b) => (b.created_at >= a.created_at ? b : a));
    const members = traces.filter((a) => a.acquisition_id === newest.acquisition_id);
    const uploaded = members.some((a) => a.uploaded === true);
    const capture: Omit<Capture, "frame"> = {
      acquisitionId: newest.acquisition_id as string,
      artifactIds: members.map((a) => a.artifact_id),
      createdAt: newest.created_at,
      number: countsFromArtifacts(artifacts).total,
      fullResolution: false,
      note: members.find((a) => (a.annotation ?? "").trim() !== "")?.annotation ?? "",
      flagged: !uploaded && members.some((a) => a.persist),
    };

    let frame: Capture["frame"] | null = null;
    try {
      const waveforms = await Promise.all(
        members.map((a) => getArtifactWaveform(this.host.token, sessionId, a.artifact_id)),
      );
      frame = frameFromArchive(waveforms, this.host.getState().settings.applied, this.host.now());
    } catch {
      frame = null; // keep the capture (note, flag) even without a plot
    }
    if (this.host.isDisposed() || this.host.getState().lastCapture) return;
    const applied = this.host.getState().settings.applied;
    this.host.update((s) => ({
      ...s,
      // Without waveforms the capture keeps an empty frame and the plot stays as it is.
      lastCapture: { ...capture, frame: frame ?? frameFromArchive([], applied, this.host.now()) },
      frame: s.frame ?? frame,
    }));
  }

  private flagAll(sessionId: string, capture: Capture, flagged: boolean): Promise<unknown> {
    return Promise.all(
      capture.artifactIds.map((id) => flagArtifact(this.host.token, sessionId, id, flagged)),
    );
  }

  private patchLastCapture(acquisitionId: string, patch: Partial<Capture>): void {
    this.host.update((s) =>
      s.lastCapture && s.lastCapture.acquisitionId === acquisitionId
        ? { ...s, lastCapture: { ...s.lastCapture, ...patch } }
        : s,
    );
  }
}
