/**
 * Framework-free device session store (review §6.1): one instance per device.
 *
 * The class owns the immutable state and the listener list and wires the
 * focused modules together:
 *
 * | module                  | responsibility                                   |
 * | ----------------------- | ------------------------------------------------ |
 * | `lockController.ts`     | take / reclaim / release, heartbeat, unload, tabs |
 * | `liveController.ts`     | live preview loop and payload-free scope commands |
 * | `captureController.ts`  | captures, full resolution, series, notes, counts |
 * | `settingsApplier.ts`    | debounced "apply immediately" settings           |
 * | `commandQueue.ts`       | serialized device commands, `busy`               |
 * | `jobs.ts`               | job list for the status bar                      |
 *
 * Construction has no side effects; `start()` talks to the backend and
 * `dispose()` stops every timer, loop, listener and subscription (it does not
 * release the lock).
 */
import { CaptureController } from "./captureController";
import { CommandQueue } from "./commandQueue";
import { type StoreHost } from "./context";
import { createInitialState } from "./initialState";
import { JobTracker } from "./jobs";
import { LiveController } from "./liveController";
import { LockController, type LockControllerOptions } from "./lockController";
import { SettingsApplier } from "./settingsApplier";
import type { DeviceSessionActions, DeviceSessionState } from "./types";

export interface DeviceSessionStoreOptions extends LockControllerOptions {
  deviceId: string;
  token: string;
  /** Clock override for tests. */
  now?: () => number;
}

export type StoreListener = () => void;

export class DeviceSessionStore {
  /** Stable action object — safe to pass to memoized children. */
  readonly actions: DeviceSessionActions;

  private state: DeviceSessionState;
  private readonly listeners = new Set<StoreListener>();
  private disposed = false;
  private started: Promise<void> | null = null;

  private readonly host: StoreHost;
  private readonly queue: CommandQueue;
  private readonly jobs: JobTracker;
  private readonly settings: SettingsApplier;
  private readonly lock: LockController;
  private readonly live: LiveController;
  private readonly captures: CaptureController;

  /**
   * @param options - Device, token and optional test hooks
   */
  constructor(options: DeviceSessionStoreOptions) {
    const { deviceId, token, now = Date.now } = options;
    this.state = createInitialState(deviceId);
    this.host = {
      deviceId,
      token,
      getState: this.getState,
      update: (fn) => this.update(fn),
      isDisposed: () => this.disposed,
      now,
    };
    this.queue = new CommandQueue(
      (busy) => this.update((s) => (s.busy === busy ? s : { ...s, busy })),
      () => this.disposed,
    );
    this.jobs = new JobTracker(this.host);
    this.settings = new SettingsApplier(this.host, this.queue);
    this.captures = new CaptureController(this.host, this.queue, this.jobs, {
      stopLive: () => this.live.stopAndWait(),
    });
    this.live = new LiveController(this.host, this.queue, this.jobs, {
      stopSeries: () => this.captures.stopSeries(),
      reloadSettings: () => this.settings.reload(),
    });
    this.lock = new LockController(
      this.host,
      this.jobs,
      {
        stopLoops: async () => {
          await Promise.all([
            this.captures.stopSeries(),
            this.live.stopAndWait(),
          ]);
        },
        stopActivity: async () => {
          this.settings.reset();
          await Promise.all([
            this.captures.stopSeries(),
            this.live.stopAndWait(),
          ]);
        },
        loadSessionData: () => this.loadSessionData(),
      },
      options,
    );
    this.actions = this.createActions();
  }

  /** Current immutable state (stable identity between changes). */
  getState = (): DeviceSessionState => this.state;

  /**
   * Registers a change listener.
   * @param listener - Called after every state change
   * @returns A function that removes the listener
   */
  subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** True after {@link dispose}. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Loads the device, reclaims a lock that is already ours and starts the tab
   * channel and unload handling. Idempotent.
   * @returns A promise that resolves when the initial load (and reclaim) is done
   */
  start(): Promise<void> {
    if (!this.started) {
      this.lock.start();
      this.started = Promise.all([
        this.lock.refreshDevice(),
        this.settings.preload(),
      ]).then(() => undefined);
    }
    return this.started;
  }

  /**
   * Stops every timer, loop, listener and subscription. The lock is NOT
   * released (it expires by itself or is reclaimed after a reload).
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lock.dispose();
    this.settings.dispose();
    this.jobs.dispose();
    this.queue.releaseWaiters();
    void this.live.stopAndWait();
    void this.captures.stopSeries();
    this.listeners.clear();
  }

  private update(fn: (state: DeviceSessionState) => DeviceSessionState): void {
    if (this.disposed) return;
    const next = fn(this.state);
    if (next === this.state) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  /** Settings, memory depth and archive counts of the (re)claimed session; restores the last capture. */
  private async loadSessionData(): Promise<void> {
    const [, , artifacts] = await Promise.all([
      this.settings.reload(),
      this.settings.refreshMemoryDepth(),
      this.captures.loadCounts(false),
    ]);
    // After a reload (reclaimed lock) the newest capture comes back from the archive.
    if (artifacts) await this.captures.restoreLastCapture(artifacts);
  }

  private createActions(): DeviceSessionActions {
    return {
      refreshDevice: () => this.lock.refreshDevice(),
      takeControl: () => this.lock.takeControl(),
      release: () => this.lock.release(),

      startLive: () => this.live.start(),
      stopLive: () => this.live.stop(),
      pauseLive: () => this.live.pause(),
      resumeLive: () => this.live.resume(),
      stopScope: () => this.live.stopScope(),
      single: () => this.live.single(),
      forceTrigger: () => this.live.forceTrigger(),
      autoscale: () => this.live.autoscale(),

      saveCapture: () => this.captures.saveCapture(),
      saveFullResolution: () => this.captures.saveFullResolution(),
      cancelFullResolution: () => this.captures.cancelFullResolution(),
      saveScreenshot: () => this.captures.saveScreenshot(),
      startSeries: () => this.captures.startSeries(),
      stopSeries: () => void this.captures.stopSeries(),

      setSetting: (path, value) => this.settings.set(path, value),
      reloadSettings: () => this.settings.reload(),

      saveNote: (text, flag) => this.captures.saveNote(text, flag),
      setCaptureFlag: (flagged) => this.captures.setCaptureFlag(flagged),
      refreshCounts: () => this.captures.refreshCounts(),

      dismissJob: (id) => this.jobs.dismiss(id),
    };
  }
}
