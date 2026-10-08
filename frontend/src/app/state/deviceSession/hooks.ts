/** React bindings of the device session store. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { DeviceSessionRegistry } from "./registry";
import { SelectorCache } from "./selectorCache";
import type { DeviceSessionStore } from "./store";
import type {
  DeviceSession,
  DeviceSessionState,
  SettingPath,
  SettingStatus,
  SettingValue,
} from "./types";
import { readValue } from "./settingsPaths";

/** Provided by `DeviceSessionProvider`; null while logged out. */
export const DeviceSessionContext = createContext<DeviceSessionRegistry | null | undefined>(
  undefined,
);

/**
 * Returns the (started) store of a device. Starting reloads the device and
 * reclaims a lock that is already ours; it is idempotent.
 * @param deviceId - The device
 * @returns The shared store, or null when nobody is logged in
 */
export function useDeviceSessionStore(deviceId: string): DeviceSessionStore | null {
  const registry = useContext(DeviceSessionContext);
  if (registry === undefined) {
    throw new Error("useDeviceSession must be used within <DeviceSessionProvider>");
  }
  const store = useMemo(() => registry?.get(deviceId) ?? null, [registry, deviceId]);
  useEffect(() => {
    void store?.start();
  }, [store]);
  return store;
}

const NO_OP_SUBSCRIBE = () => () => {};

/**
 * Whole session of a device: state and actions; re-renders on every change.
 * Prefer {@link useDeviceSessionSelector} in components that only need a slice.
 * @param deviceId - The device
 * @returns `{ state, actions }`
 */
export function useDeviceSession(deviceId: string): DeviceSession {
  const store = useDeviceSessionStore(deviceId);
  const state = useSyncExternalStore(
    store ? store.subscribe : NO_OP_SUBSCRIBE,
    store ? store.getState : getNoState,
  );
  return useMemo(() => ({ state: state as DeviceSessionState, actions: store!.actions }), [state, store]);
}

function getNoState(): never {
  throw new Error("Not logged in: no device session available");
}

/**
 * Subscribes to a slice of the session; re-renders only when the slice changes.
 * @param deviceId - The device
 * @param selector - Picks the slice (may return a new object for equal content)
 * @param isEqual - Slice equality, default `Object.is`
 * @returns The selected slice
 */
export function useDeviceSessionSelector<T>(
  deviceId: string,
  selector: (state: DeviceSessionState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useDeviceSessionStore(deviceId);
  const [cache] = useState(() => new SelectorCache<DeviceSessionState, T>());
  const getSnapshot = useCallback(
    () => cache.select(store!.getState(), selector, isEqual),
    [cache, store, selector, isEqual],
  );
  return useSyncExternalStore(store ? store.subscribe : NO_OP_SUBSCRIBE, getSnapshot);
}

/** Result of {@link useSetting}. */
export interface UseSetting {
  /** What the control shows: the pending value, else the applied one. */
  value: SettingValue | undefined;
  /** Last value confirmed by the scope. */
  applied: SettingValue | undefined;
  /** pending / applying / applied / error, with message and time. */
  status: SettingStatus | undefined;
  /** Changes the setting (applied to the scope after a short debounce). */
  set(value: SettingValue): void;
}

interface SettingSlice {
  pending: SettingValue | undefined;
  applied: SettingValue | undefined;
  status: SettingStatus | undefined;
}

const sameSlice = (a: SettingSlice, b: SettingSlice) =>
  a.pending === b.pending && a.applied === b.applied && a.status === b.status;

/**
 * One setting of the device: value, applied value, status and setter.
 * @param deviceId - The device
 * @param path - e.g. `channels.1.scale_v_div`, `timebase.scale_s_div`, `trigger.level_v`
 * @returns The setting slice and its setter
 */
export function useSetting(deviceId: string, path: SettingPath): UseSetting {
  const store = useDeviceSessionStore(deviceId);
  const slice = useDeviceSessionSelector(
    deviceId,
    (s): SettingSlice => ({
      pending: s.settings.pending[path],
      applied: s.settings.applied ? readValue(s.settings.applied, path) : undefined,
      status: s.settings.status[path],
    }),
    sameSlice,
  );
  const set = useCallback(
    (value: SettingValue) => store?.actions.setSetting(path, value),
    [store, path],
  );
  return useMemo(
    () => ({ value: slice.pending ?? slice.applied, applied: slice.applied, status: slice.status, set }),
    [slice, set],
  );
}
