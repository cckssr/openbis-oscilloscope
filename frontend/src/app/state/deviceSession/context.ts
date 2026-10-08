/**
 * Shared plumbing of the device session store. The store class owns the state;
 * the focused modules (lock, live loop, settings, captures …) only see it
 * through the small {@link StoreHost} interface.
 */
import { de } from "../../../i18n/de";
import { notifyError } from "../../../lib/notify";
import type { DeviceSessionState } from "./types";

const t = de.control.session;

/** What the focused modules may do with the store. */
export interface StoreHost {
  readonly deviceId: string;
  readonly token: string;
  /** Current immutable state. */
  getState(): DeviceSessionState;
  /** Replaces the state with the result of `fn`; returning the same object is a no-op. */
  update(fn: (state: DeviceSessionState) => DeviceSessionState): void;
  /** True after `dispose()` — async continuations must stop touching state. */
  isDisposed(): boolean;
  /** Clock (ms since epoch); `Date.now` unless a test injects another. */
  now(): number;
}

/** Thrown into queued commands when the store was disposed before they ran. */
export class DisposedError extends Error {
  constructor() {
    super("device session disposed");
    this.name = "DisposedError";
  }
}

/**
 * Returns the session id when this tab controls the device, otherwise shows a
 * toast and returns null. Every action that talks to the scope starts here.
 * @param host - The store host
 * @returns The control session id, or null when this tab does not control the device
 */
export function requireControl(host: StoreHost): string | null {
  const { lock } = host.getState();
  if (lock.status === "held" && lock.sessionId) return lock.sessionId;
  notifyError(new Error(t.lock.notControlling), t.lock.notControlling);
  return null;
}

/**
 * Session id under which the archive of this device is reachable: the active
 * control session, or the last one after a release.
 * @param state - Current store state
 * @returns The session id, or undefined when there never was a session
 */
export function archiveSessionId(state: DeviceSessionState): string | undefined {
  return state.lock.sessionId ?? state.lock.previousSessionId;
}

/**
 * Generates a random id (UUID when available).
 * @returns A unique-enough id string
 */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A sleep that can be cut short (loops use it so `stop()` returns immediately). */
export interface CancellableSleep {
  promise: Promise<void>;
  cancel(): void;
}

/**
 * Creates a timer promise that resolves after `ms` or as soon as it is cancelled.
 * @param ms - Delay in milliseconds
 * @returns The promise plus a cancel function
 */
export function cancellableSleep(ms: number): CancellableSleep {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    done = resolve;
    timer = setTimeout(resolve, ms);
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
      done();
    },
  };
}
