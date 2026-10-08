/**
 * Settings model "apply immediately" (review §2.3 P1): a change is stored as
 * `pending`, debounced per group (channel n / timebase / trigger) and then
 * written to the scope as the applied group plus the pending values. Success
 * updates `applied`; failure reverts the control and shows a toast. Captures
 * and overlays always use `applied`.
 */
import {
  getSettings,
  getMemoryDepth,
  setChannelConfig,
  setTimebase,
  setTrigger,
} from "../../../api/devices";
import type {
  ChannelConfig,
  TimebaseConfig,
  TriggerConfig,
} from "../../../api/types";
import { de } from "../../../i18n/de";
import { notifyError, errorMessage } from "../../../lib/notify";
import type { CommandQueue } from "./commandQueue";
import { DisposedError, requireControl, type StoreHost } from "./context";
import {
  groupOf,
  mergeGroup,
  readValue,
  withGroup,
  type SettingGroup,
} from "./settingsPaths";
import type {
  SettingPath,
  SettingValue,
  SettingsSnapshot,
  SettingsState,
} from "./types";

const t = de.control.session;

/** Debounce between the last edit of a group and the write to the scope. */
export const SETTINGS_DEBOUNCE_MS = 400;

export class SettingsApplier {
  private timers = new Map<SettingGroup, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly host: StoreHost,
    private readonly queue: CommandQueue,
    private readonly debounceMs = SETTINGS_DEBOUNCE_MS,
  ) {}

  /**
   * Records a change and schedules the write.
   * @param path - Setting path
   * @param value - New value
   */
  set(path: SettingPath, value: SettingValue): void {
    const applied = this.host.getState().settings.applied;
    if (!applied) return;
    if (!requireControl(this.host)) return;
    const group = groupOf(path);
    const now = this.host.now();

    this.patchSettings((s) => {
      const pending = { ...s.pending };
      const status = { ...s.status };
      if (readValue(applied, path) === value) {
        // Back at the applied value: nothing left to write for this path.
        delete pending[path];
        delete status[path];
      } else {
        pending[path] = value;
        status[path] = { state: "pending", at: now };
      }
      return { ...s, pending, status };
    });

    this.schedule(group);
  }

  /**
   * Reads all settings from the scope, dropping pending edits.
   * @returns A promise that resolves when the settings are loaded (or failed with a toast)
   */
  async reload(): Promise<void> {
    this.reset();
    this.patchSettings((s) => ({ ...s, loading: true }));
    try {
      const fresh = await this.queue.run(t.busy.readSettings, () =>
        getSettings(this.host.token, this.host.deviceId),
      );
      this.patchSettings((s) => ({
        ...s,
        loading: false,
        applied: {
          channels: fresh.channels,
          timebase: fresh.timebase,
          trigger: fresh.trigger,
        },
      }));
    } catch (err) {
      if (err instanceof DisposedError) return;
      this.patchSettings((s) => ({ ...s, loading: false }));
      notifyError(
        err,
        t.toast.settingsLoadFailed,
        t.toast.settingsLoadFailedTitle,
      );
    }
  }

  /**
   * Reads the settings once without a lock (GET /settings), so they can be
   * shown read-only before the device is taken. Silent on failure (the device
   * may be offline) and never overwrites settings that are already loaded.
   * @returns A promise that resolves when done (never rejects)
   */
  async preload(): Promise<void> {
    try {
      const fresh = await getSettings(this.host.token, this.host.deviceId);
      if (this.host.isDisposed()) return;
      this.patchSettings((s) =>
        s.applied
          ? s
          : {
              ...s,
              applied: {
                channels: fresh.channels,
                timebase: fresh.timebase,
                trigger: fresh.trigger,
              },
            },
      );
    } catch {
      // read-only preview only
    }
  }

  /**
   * Cancels debounce timers and drops all pending edits (release, lost lock).
   */
  reset(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.patchSettings((s) =>
      Object.keys(s.pending).length === 0 && Object.keys(s.status).length === 0
        ? s
        : { ...s, pending: {}, status: {} },
    );
  }

  /** Clears timers; call once on dispose. */
  dispose(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  /**
   * Reads the memory depth from the scope into the state (best effort, silent).
   * @returns A promise that resolves when done
   */
  async refreshMemoryDepth(): Promise<void> {
    try {
      const res = await getMemoryDepth(this.host.token, this.host.deviceId);
      if (this.host.isDisposed()) return;
      this.host.update((s) =>
        s.memoryDepth === res.memory_depth
          ? s
          : { ...s, memoryDepth: res.memory_depth },
      );
    } catch {
      // the depth is informational; a failure must not disturb the user
    }
  }

  private schedule(group: SettingGroup): void {
    const existing = this.timers.get(group);
    if (existing) clearTimeout(existing);
    const hasPending = Object.keys(this.host.getState().settings.pending).some(
      (p) => groupOf(p as SettingPath) === group,
    );
    if (!hasPending) {
      this.timers.delete(group);
      return;
    }
    this.timers.set(
      group,
      setTimeout(() => {
        this.timers.delete(group);
        this.queue
          .run(t.busy.applySettings, () => this.applyGroup(group))
          .catch(() => undefined);
      }, this.debounceMs),
    );
  }

  /** Runs inside the command queue: writes one group and reconciles the state. */
  private async applyGroup(group: SettingGroup): Promise<void> {
    if (this.host.isDisposed()) return;
    const state = this.host.getState();
    const { applied } = state.settings;
    const sessionId = state.lock.sessionId;
    if (!applied || !sessionId || state.lock.status !== "held") return;

    const entries = (
      Object.entries(state.settings.pending) as Array<
        [SettingPath, SettingValue]
      >
    ).filter(([path]) => groupOf(path) === group);
    if (entries.length === 0) return;

    const at = this.host.now();
    this.patchSettings((s) => ({
      ...s,
      status: {
        ...s.status,
        ...Object.fromEntries(
          entries.map(([p]) => [p, { state: "applying", at }]),
        ),
      },
    }));

    const merged = mergeGroup(applied, group, entries);
    try {
      await this.write(group, sessionId, merged);
    } catch (err) {
      if (this.host.isDisposed()) return;
      const message = errorMessage(err, t.toast.settingFailed);
      this.settle(entries, null, message);
      notifyError(err, t.toast.settingFailed, t.toast.settingFailedTitle);
      await this.readBack(group);
      return;
    }
    if (this.host.isDisposed()) return;
    this.settle(entries, { group, config: merged });
    if (group === "timebase") await this.refreshMemoryDepth();
    await this.readBack(group);
  }

  private write(
    group: SettingGroup,
    sessionId: string,
    config: ChannelConfig | TimebaseConfig | TriggerConfig,
  ): Promise<void> {
    const { token, deviceId } = this.host;
    if (group === "timebase") {
      const { scale_s_div, offset_s } = config as TimebaseConfig;
      return setTimebase(token, deviceId, sessionId, { scale_s_div, offset_s });
    }
    if (group === "trigger") {
      return setTrigger(token, deviceId, sessionId, config as TriggerConfig);
    }
    const channel = Number(group.split(".")[1]);
    return setChannelConfig(
      token,
      deviceId,
      channel,
      sessionId,
      config as ChannelConfig,
    );
  }

  /**
   * Clears the written pending entries that were not edited again meanwhile.
   * @param entries - What was written
   * @param success - On success the new applied group config
   * @param error - On failure the German message (the entries are reverted)
   */
  private settle(
    entries: Array<[SettingPath, SettingValue]>,
    success: {
      group: SettingGroup;
      config: ChannelConfig | TimebaseConfig | TriggerConfig;
    } | null,
    error?: string,
  ): void {
    const at = this.host.now();
    this.patchSettings((s) => {
      const pending = { ...s.pending };
      const status = { ...s.status };
      for (const [path, value] of entries) {
        if (pending[path] !== value) continue; // edited again — stays pending
        delete pending[path];
        status[path] = error
          ? { state: "error", error, at }
          : { state: "applied", at };
      }
      let applied = s.applied;
      if (success && applied)
        applied = withGroup(applied, success.group, success.config);
      return { ...s, pending, status, applied, touched: s.touched || !error };
    });
  }

  /**
   * Re-reads the group from the scope so values the scope rounded or refused
   * show up (best effort; edits made meanwhile are kept).
   */
  private async readBack(group: SettingGroup): Promise<void> {
    let fresh: SettingsSnapshot;
    try {
      const res = await getSettings(this.host.token, this.host.deviceId);
      fresh = {
        channels: res.channels,
        timebase: res.timebase,
        trigger: res.trigger,
      };
    } catch {
      return;
    }
    if (this.host.isDisposed()) return;
    this.patchSettings((s) => {
      if (!s.applied) return s;
      const hasPending = Object.keys(s.pending).some(
        (p) => groupOf(p as SettingPath) === group,
      );
      if (hasPending) return s;
      const config =
        group === "timebase"
          ? fresh.timebase
          : group === "trigger"
            ? fresh.trigger
            : fresh.channels[Number(group.split(".")[1])];
      return config
        ? { ...s, applied: withGroup(s.applied, group, config) }
        : s;
    });
  }

  private patchSettings(fn: (s: SettingsState) => SettingsState): void {
    this.host.update((state) => {
      const settings = fn(state.settings);
      return settings === state.settings ? state : { ...state, settings };
    });
  }
}
