/**
 * Live preview (review A5–A7) and the payload-free scope commands.
 *
 * Live = RUN on the scope plus a sequential preview loop. Nothing is stored in
 * the archive. Only channels enabled in the *applied* settings are requested
 * (A6); frames refresh `settings.applied` except for paths the user is editing.
 */
import {
  previewWaveforms,
  runDevice,
  sendScopeCommand,
  stopDevice,
  type ScopeCommand,
} from "../../../api/devices";
import type { PreviewResponse } from "../../../api/types";
import { de } from "../../../i18n/de";
import { errorMessage, notifyError } from "../../../lib/notify";
import type { CommandQueue } from "./commandQueue";
import { DisposedError, requireControl, type StoreHost } from "./context";
import { enabledChannels, frameFromPreview } from "./frames";
import type { JobTracker } from "./jobs";
import { LiveLoop } from "./liveLoop";
import { mergeFrameIntoApplied } from "./settingsPaths";
import type { LiveStatus } from "./types";

const t = de.control.session;

export interface LiveControllerDeps {
  /** Ends a running series (live and series exclude each other). */
  stopSeries(): Promise<void>;
  /** Re-reads settings from the scope (after Auto-Setup). */
  reloadSettings(): Promise<void>;
}

export class LiveController {
  private readonly loop: LiveLoop;

  constructor(
    private readonly host: StoreHost,
    private readonly queue: CommandQueue,
    private readonly jobs: JobTracker,
    private readonly deps: LiveControllerDeps,
  ) {
    this.loop = new LiveLoop({
      fetchFrame: () => this.fetchFrame(),
      yieldToCommands: () => queue.whenIdle(),
      onFrame: (resp) => this.applyFrame(resp),
      onGiveUp: (err) => this.giveUp(err),
      now: () => host.now(),
    });
  }

  /**
   * ▶ Live starten. No-op unless live is off (a second click must not start a new run).
   * @returns A promise that resolves once the loop runs (or the start failed with a toast)
   */
  async start(): Promise<void> {
    if (this.host.getState().live.status !== "off") return;
    const sessionId = requireControl(this.host);
    if (!sessionId) return;
    await this.deps.stopSeries();
    this.setLive("starting");
    try {
      await this.queue.run(t.busy.run, () =>
        runDevice(this.host.token, this.host.deviceId, sessionId),
      );
    } catch (err) {
      if (err instanceof DisposedError || this.host.isDisposed()) return;
      this.setLive("off", errorMessage(err, t.toast.liveStartFailed));
      notifyError(err, t.toast.liveStartFailed, t.toast.liveStartFailedTitle);
      return;
    }
    const { live, lock } = this.host.getState();
    if (this.host.isDisposed() || live.status !== "starting" || lock.status !== "held") return;
    this.setLive("on");
    this.loop.start();
  }

  /** ■ Live stoppen: ends the loop only; the scope keeps running. */
  stop(): void {
    void this.stopAndWait();
  }

  /**
   * Ends the loop and waits for the in-flight frame (which is discarded).
   * @returns A promise that resolves once no preview request is pending
   */
  async stopAndWait(): Promise<void> {
    if (this.host.getState().live.status !== "off") this.setLive("off");
    await this.loop.stop();
  }

  /** Control page left: pause the loop but remember that live was on. */
  pause(): void {
    const { status } = this.host.getState().live;
    if (status !== "on" && status !== "starting") return;
    this.setLive("paused");
    void this.loop.stop();
  }

  /** Control page entered again: continue a paused live view. */
  resume(): void {
    const { live, lock } = this.host.getState();
    if (live.status !== "paused") return;
    if (lock.status !== "held") {
      this.setLive("off");
      return;
    }
    this.setLive("on");
    this.loop.start();
  }

  // -------------------------------------------------------------------------
  // Scope commands
  // -------------------------------------------------------------------------

  /**
   * Hardware STOP; also ends live and series.
   * @returns A promise that resolves when the scope stopped
   */
  async stopScope(): Promise<void> {
    const sessionId = requireControl(this.host);
    if (!sessionId) return;
    await this.deps.stopSeries();
    await this.stopAndWait();
    await this.command(t.busy.stop, () =>
      stopDevice(this.host.token, this.host.deviceId, sessionId),
    );
  }

  /**
   * Arms one trigger (live is ended: the next trigger is the single shot).
   * @returns A promise that resolves when the command was accepted
   */
  async single(): Promise<void> {
    const sessionId = requireControl(this.host);
    if (!sessionId) return;
    await this.deps.stopSeries();
    await this.stopAndWait();
    await this.scopeCommand("single", t.busy.single, sessionId);
  }

  /**
   * Forces a trigger now (live keeps running).
   * @returns A promise that resolves when the command was accepted
   */
  async forceTrigger(): Promise<void> {
    const sessionId = requireControl(this.host);
    if (!sessionId) return;
    await this.scopeCommand("force-trigger", t.busy.forceTrigger, sessionId);
  }

  /**
   * Scope Auto-Setup; reloads the settings afterwards.
   * @returns A promise that resolves when the scope has settled
   */
  async autoscale(): Promise<void> {
    const sessionId = requireControl(this.host);
    if (!sessionId) return;
    const jobId = this.jobs.start("autoscale", t.jobs.autoscale);
    try {
      await this.queue.run(t.busy.autoscale, () =>
        sendScopeCommand(this.host.token, this.host.deviceId, sessionId, "autoscale"),
      );
    } catch (err) {
      if (err instanceof DisposedError) return;
      this.jobs.finish(jobId, "error", errorMessage(err, t.toast.autoscaleFailed));
      notifyError(err, t.toast.autoscaleFailed, t.toast.autoscaleFailedTitle);
      return;
    }
    this.jobs.finish(jobId, "done");
    this.host.update((s) => ({ ...s, settings: { ...s.settings, touched: true } }));
    await this.deps.reloadSettings();
  }

  private scopeCommand(command: ScopeCommand, label: string, sessionId: string): Promise<void> {
    return this.command(label, () =>
      sendScopeCommand(this.host.token, this.host.deviceId, sessionId, command),
    );
  }

  private async command(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await this.queue.run(label, fn);
    } catch (err) {
      if (err instanceof DisposedError) return;
      notifyError(err, t.toast.commandFailed, t.toast.commandFailedTitle);
    }
  }

  // -------------------------------------------------------------------------
  // Loop callbacks
  // -------------------------------------------------------------------------

  private fetchFrame(): Promise<PreviewResponse> {
    const { lock, settings } = this.host.getState();
    if (!lock.sessionId) return Promise.reject(new Error("no session"));
    return previewWaveforms(
      this.host.token,
      this.host.deviceId,
      lock.sessionId,
      enabledChannels(settings.applied),
    );
  }

  private applyFrame(resp: PreviewResponse): void {
    if (this.host.isDisposed()) return;
    const now = this.host.now();
    const frame = frameFromPreview(resp, now);
    this.host.update((s) => {
      const applied = mergeFrameIntoApplied(s.settings, resp.channels, resp.timebase, resp.trigger);
      return {
        ...s,
        frame,
        live: { ...s.live, lastFrameAt: now, error: undefined },
        settings: applied && applied !== s.settings.applied ? { ...s.settings, applied } : s.settings,
      };
    });
  }

  private giveUp(err: unknown): void {
    if (this.host.isDisposed()) return;
    this.setLive("off", errorMessage(err, t.toast.liveFailed));
    notifyError(err, t.toast.liveFailed, t.toast.liveFailedTitle);
  }

  private setLive(status: LiveStatus, error?: string): void {
    this.host.update((s) => ({ ...s, live: { ...s.live, status, error } }));
  }
}
