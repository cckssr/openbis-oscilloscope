/**
 * Device lock lifecycle of one store: take / reclaim / release, heartbeat,
 * soft release on page unload and hand-over between tabs of the same browser.
 *
 * Rules (review §2.3 "Session robustness", A11, A12):
 * - A lock that is already ours on the server (`is_mine` + `session_id`) is
 *   reclaimed instead of re-acquired, e.g. after a reload.
 * - Only the controlling tab sends heartbeats and runs loops. Other tabs of the
 *   browser are `passive` until the user takes over.
 * - On page unload the controlling tab soft-releases (never hard-unlocks).
 */
import { getConfig } from "../../../api/config";
import {
  acquireLock,
  getDevice,
  releaseLock,
  sendHeartbeat,
  softReleaseLockOnUnload,
} from "../../../api/devices";
import type { DeviceDetail } from "../../../api/types";
import { de } from "../../../i18n/de";
import { errorMessage, notifyError } from "../../../lib/notify";
import { createInitialState } from "./initialState";
import { Heartbeat } from "./heartbeat";
import { uid, type StoreHost } from "./context";
import {
  TabCoordinator,
  defaultChannelFactory,
  type ChannelFactory,
} from "./tabCoordinator";
import type { JobTracker } from "./jobs";
import type { DeviceSessionState, LockState } from "./types";

const t = de.control.session;

/** Default heartbeat period; shortened when the backend TTL is small. */
export const DEFAULT_HEARTBEAT_MS = 60_000;

/** Side effects of the lock the other modules provide. */
export interface LockHooks {
  /** Stops live preview and series (waits for requests in flight). */
  stopLoops(): Promise<void>;
  /** `stopLoops` plus dropping pending settings (control is gone or handed over). */
  stopActivity(): Promise<void>;
  /** Loads settings, memory depth and capture counts for the session. */
  loadSessionData(): Promise<void>;
}

export interface LockControllerOptions {
  createChannel?: ChannelFactory;
  tabId?: string;
  /** How long a starting tab waits for another tab to claim control. */
  tabQueryMs?: number;
  /** Delay before the single heartbeat retry after a network error. */
  heartbeatRetryMs?: number;
}

/** Backend timestamps are epoch seconds; accept milliseconds too. */
function toMillis(value: number | undefined): number | undefined {
  if (!value || value <= 0) return undefined;
  return value < 1e11 ? value * 1000 : value;
}

export class LockController {
  private readonly tabs: TabCoordinator;
  private readonly heartbeat: Heartbeat;
  private readonly tabQueryMs: number;
  private reclaiming = false;
  /** When a reclaimed lock was originally acquired (ms), for "aktiv seit …". */
  private sinceHint: number | undefined;
  private listening = false;

  constructor(
    private readonly host: StoreHost,
    private readonly jobs: JobTracker,
    private readonly hooks: LockHooks,
    options: LockControllerOptions = {},
  ) {
    this.tabQueryMs = options.tabQueryMs ?? 300;
    this.tabs = new TabCoordinator(
      host.deviceId,
      options.tabId ?? uid(),
      {
        controllingSessionId: () => {
          const { lock } = host.getState();
          return lock.status === "held" ? (lock.sessionId ?? null) : null;
        },
        onTakenOver: (sessionId) => void this.becomePassive(sessionId),
        onReleasedElsewhere: (sessionId) => this.followRelease(sessionId),
        onLostElsewhere: (sessionId) => this.followLoss(sessionId),
      },
      options.createChannel ?? defaultChannelFactory,
    );
    this.heartbeat = new Heartbeat(
      () => {
        const sessionId = host.getState().lock.sessionId;
        return sessionId
          ? sendHeartbeat(host.token, host.deviceId, sessionId)
          : Promise.resolve();
      },
      () => void this.loseControl(),
      options.heartbeatRetryMs,
    );
  }

  /** Opens the tab channel and installs the unload listeners. */
  start(): void {
    this.tabs.open();
    if (typeof window !== "undefined" && !this.listening) {
      window.addEventListener("pagehide", this.onUnload);
      window.addEventListener("pageshow", this.onShow);
      this.listening = true;
    }
  }

  /** Stops timers, listeners and the channel. The lock itself is not released. */
  dispose(): void {
    this.heartbeat.stop();
    this.tabs.close();
    if (typeof window !== "undefined" && this.listening) {
      window.removeEventListener("pagehide", this.onUnload);
      window.removeEventListener("pageshow", this.onShow);
    }
    this.listening = false;
  }

  // -------------------------------------------------------------------------
  // Device info and reclaim
  // -------------------------------------------------------------------------

  /**
   * Reloads the device (capabilities, channel count) and reclaims our own lock.
   * @returns A promise that resolves when the device and a possible reclaim are done
   */
  async refreshDevice(): Promise<void> {
    const device = await this.loadDevice();
    if (!device || this.host.isDisposed()) return;
    const mine = device.lock?.is_mine ? device.lock.session_id : undefined;
    const { status } = this.host.getState().lock;
    if (mine && (status === "none" || status === "lost") && !this.reclaiming) {
      this.reclaiming = true;
      try {
        await this.reclaim(mine, toMillis(device.lock?.acquired_at));
      } finally {
        this.reclaiming = false;
      }
    }
  }

  private async loadDevice(): Promise<DeviceDetail | null> {
    try {
      const device = await getDevice(this.host.token, this.host.deviceId);
      if (this.host.isDisposed()) return null;
      this.host.update((s) => ({
        ...s,
        device,
        deviceError: undefined,
        capabilities: device.capabilities ?? [],
        channelCount: device.channel_count ?? s.channelCount,
      }));
      return device;
    } catch (err) {
      if (!this.host.isDisposed()) {
        const message = errorMessage(err, t.lock.deviceLoadFailed);
        this.host.update((s) => ({ ...s, deviceError: message }));
      }
      return null;
    }
  }

  /** Server still has our lock: ask other tabs, then become held or passive. */
  private async reclaim(
    sessionId: string,
    acquiredAtMs?: number,
  ): Promise<void> {
    this.setLock({ status: "acquiring", sessionId, error: undefined });
    this.sinceHint = acquiredAtMs;
    const otherTab = await this.tabs.queryController(this.tabQueryMs);
    if (this.host.isDisposed()) return;
    if (otherTab) {
      this.setLock({ status: "passive", sessionId });
      await this.hooks.loadSessionData();
      return;
    }
    await this.becomeHeld(sessionId);
  }

  // -------------------------------------------------------------------------
  // Take / release
  // -------------------------------------------------------------------------

  /**
   * "Gerät übernehmen": acquires the lock, reclaims our own, or takes over from another tab.
   * @returns A promise that resolves when control is taken (or failed with a toast)
   */
  async takeControl(): Promise<void> {
    const before = this.host.getState().lock;
    if (
      before.status === "held" ||
      before.status === "acquiring" ||
      before.status === "releasing"
    ) {
      return;
    }
    if (before.status === "passive" && before.sessionId) {
      await this.becomeHeld(before.sessionId);
      return;
    }

    this.sinceHint = undefined;
    const jobId = this.jobs.start("take-control", t.jobs.takeControl);
    this.setLock({ status: "acquiring", error: undefined });
    try {
      const device = await this.loadDevice();
      const mine = device?.lock?.is_mine ? device.lock.session_id : undefined;
      const sessionId =
        mine ??
        (await acquireLock(this.host.token, this.host.deviceId))
          .control_session_id;
      if (this.host.isDisposed()) return;
      await this.becomeHeld(sessionId);
      this.jobs.finish(jobId, "done");
    } catch (err) {
      if (this.host.isDisposed()) return;
      const message = errorMessage(err, t.lock.takeFailed);
      this.setLock({ status: before.status, error: message });
      this.jobs.finish(jobId, "error", message);
      notifyError(err, t.lock.takeFailed, t.lock.takeFailedTitle);
    }
  }

  /**
   * "Gerät freigeben": gives the lock back. Plot and last capture stay visible.
   * @returns A promise that resolves when the lock is released (or failed with a toast)
   */
  async release(): Promise<void> {
    const { lock } = this.host.getState();
    if (lock.status !== "held" || !lock.sessionId) return;
    const sessionId = lock.sessionId;
    await this.hooks.stopLoops();
    if (this.host.getState().busy) {
      // e.g. a full-resolution read: never pull the lock from under it
      notifyError(
        new Error(t.lock.releaseBusy),
        t.lock.releaseBusy,
        t.lock.releaseFailedTitle,
      );
      return;
    }
    this.setLock({ status: "releasing" });
    this.heartbeat.stop();
    await this.hooks.stopActivity();
    try {
      await releaseLock(this.host.token, this.host.deviceId, sessionId);
    } catch (err) {
      if (this.host.isDisposed()) return;
      this.setLock({
        status: "held",
        error: errorMessage(err, t.lock.releaseFailed),
      });
      void this.startHeartbeat();
      notifyError(err, t.lock.releaseFailed, t.lock.releaseFailedTitle);
      return;
    }
    if (this.host.isDisposed()) return;
    this.host.update((s) => ({
      ...s,
      lock: { status: "none", previousSessionId: sessionId },
      settings: { ...s.settings, touched: false },
    }));
    this.tabs.announceReleased(sessionId);
    void this.loadDevice();
  }

  // -------------------------------------------------------------------------
  // Held / passive / lost transitions
  // -------------------------------------------------------------------------

  private async becomeHeld(sessionId: string): Promise<void> {
    const previous = this.host.getState().lock;
    const knownSession = previous.sessionId ?? previous.previousSessionId;
    if (knownSession !== sessionId) this.resetSessionData();
    this.setLock({
      status: "held",
      sessionId,
      since: this.sinceHint ?? this.host.now(),
      error: undefined,
    });
    this.sinceHint = undefined;
    this.tabs.announceTakeover(sessionId);
    await this.startHeartbeat();
    if (this.host.isDisposed()) return;
    await this.hooks.loadSessionData();
  }

  private async startHeartbeat(): Promise<void> {
    const interval = await this.heartbeatInterval();
    if (this.host.isDisposed() || this.host.getState().lock.status !== "held")
      return;
    this.heartbeat.start(interval);
  }

  private async heartbeatInterval(): Promise<number> {
    try {
      const { lock_ttl_seconds } = await getConfig();
      if (lock_ttl_seconds > 0) {
        return Math.max(
          1000,
          Math.min(DEFAULT_HEARTBEAT_MS, (lock_ttl_seconds * 1000) / 5),
        );
      }
    } catch {
      // config is optional — use the default
    }
    return DEFAULT_HEARTBEAT_MS;
  }

  /** New control session: nothing of the previous one may leak into it. */
  private resetSessionData(): void {
    this.host.update((s) => {
      const fresh = createInitialState(s.deviceId);
      return {
        ...s,
        frame: null,
        lastCapture: null,
        counts: fresh.counts,
        memoryDepth: null,
        series: fresh.series,
        settings: fresh.settings,
      };
    });
  }

  private async becomePassive(sessionId: string): Promise<void> {
    const { lock } = this.host.getState();
    if (lock.status !== "held") return;
    this.heartbeat.stop();
    this.setLock({ status: "passive", sessionId });
    await this.hooks.stopActivity();
  }

  private followRelease(sessionId: string): void {
    const { lock } = this.host.getState();
    if (lock.status !== "passive") return;
    this.host.update((s) => ({
      ...s,
      lock: { status: "none", previousSessionId: sessionId },
    }));
  }

  private followLoss(sessionId: string): void {
    const { lock } = this.host.getState();
    if (lock.status !== "passive") return;
    this.host.update((s) => ({
      ...s,
      lock: {
        status: "lost",
        previousSessionId: sessionId,
        error: t.lock.lost,
      },
    }));
  }

  /** Heartbeat failed: the lock is gone. Stop everything, keep the last frame. */
  private async loseControl(): Promise<void> {
    const { lock } = this.host.getState();
    if (lock.status !== "held" || this.host.isDisposed()) return;
    this.heartbeat.stop();
    this.host.update((s) => ({
      ...s,
      lock: {
        status: "lost",
        sessionId: lock.sessionId,
        previousSessionId: lock.sessionId,
        error: t.lock.lost,
      },
    }));
    if (lock.sessionId) this.tabs.announceLost(lock.sessionId);
    notifyError(new Error(t.lock.lost), t.lock.lost, t.lock.lostTitle);
    await this.hooks.stopActivity();
  }

  private setLock(patch: Partial<LockState>): void {
    this.host.update((s: DeviceSessionState) => ({
      ...s,
      lock: { ...s.lock, ...patch },
    }));
  }

  // -------------------------------------------------------------------------
  // Page unload
  // -------------------------------------------------------------------------

  /**
   * `pagehide`: only the controlling tab soft-releases (idempotent on the server).
   * Deliberately not on `beforeunload`: that event also fires when the user
   * cancels the leave-page prompt of the control page and stays.
   */
  private onUnload = (): void => {
    const { lock } = this.host.getState();
    if (lock.status !== "held" || !lock.sessionId) return;
    softReleaseLockOnUnload(
      this.host.token,
      this.host.deviceId,
      lock.sessionId,
    );
  };

  /** Page restored from the back/forward cache: restore the full lock TTL at once. */
  private onShow = (event: PageTransitionEvent): void => {
    if (event.persisted && this.host.getState().lock.status === "held") {
      this.heartbeat.pulse();
    }
  };
}
