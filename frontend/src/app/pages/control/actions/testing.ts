/**
 * Test helpers for the control-page action/capture/status components: a tiny
 * reactive fake of the device session store. Used by `*.test.tsx` only.
 */
import { useCallback, useRef, useSyncExternalStore } from "react";
import { vi } from "vitest";
import type { Capability } from "../../../../api/types";
import { createInitialState } from "../../../state/deviceSession/initialState";
import type {
  Capture,
  DeviceSessionActions,
  DeviceSessionState,
  Job,
} from "../../../state/deviceSession/types";

export const ALL_CAPABILITIES: Capability[] = [
  "run",
  "stop",
  "acquire",
  "preview",
  "screenshot",
  "single",
  "force_trigger",
  "autoscale",
  "cancel_acquire",
];

/** State of a controlled device (lock held) with all capabilities. */
export function heldState(overrides: Partial<DeviceSessionState> = {}): DeviceSessionState {
  return {
    ...createInitialState("scope-01"),
    capabilities: ALL_CAPABILITIES,
    channelCount: 4,
    lock: { status: "held", sessionId: "sess-1" },
    ...overrides,
  };
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    kind: "full-resolution",
    label: "Volle Auflösung wird gelesen…",
    startedAt: Date.now(),
    status: "running",
    cancellable: true,
    ...overrides,
  };
}

export function makeCapture(overrides: Partial<Capture> = {}): Capture {
  return {
    acquisitionId: "acq-1",
    artifactIds: ["a1", "a2"],
    createdAt: "2026-10-08T14:02:11",
    number: 5,
    fullResolution: false,
    frame: {
      source: "capture",
      traces: [1, 2].map((channel) => ({
        id: `CH${channel}`,
        kind: "channel" as const,
        channel,
        label: `CH${channel}`,
        color: "#000",
        x: new Float64Array(2),
        y: new Float64Array(2),
        xUnit: "s" as const,
        yUnit: "V" as const,
      })),
      channels: [],
      timebase: { scaleSDiv: 1e-3, offsetS: 0, sampleRate: 1e6 },
      trigger: { source: "CH1", level_v: 0, slope: "RISE", mode: "AUTO" },
      memoryDepth: 1200,
      receivedAt: 0,
    },
    note: "",
    flagged: false,
    ...overrides,
  };
}

/** Reactive stand-in for a device session store. */
export class FakeSession {
  state: DeviceSessionState;
  private listeners = new Set<() => void>();
  readonly actions: Record<keyof DeviceSessionActions, ReturnType<typeof vi.fn>>;

  constructor(state: DeviceSessionState = heldState()) {
    this.state = state;
    const names: Array<keyof DeviceSessionActions> = [
      "refreshDevice", "takeControl", "release", "startLive", "stopLive", "pauseLive",
      "resumeLive", "stopScope", "single", "forceTrigger", "autoscale", "saveCapture",
      "saveFullResolution", "cancelFullResolution", "saveScreenshot", "startSeries",
      "stopSeries", "setSetting", "reloadSettings", "saveNote", "setCaptureFlag",
      "refreshCounts", "dismissJob",
    ];
    this.actions = Object.fromEntries(
      names.map((n) => [n, vi.fn(() => Promise.resolve(null))]),
    ) as FakeSession["actions"];
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  getState = () => this.state;

  /** Replaces parts of the state and notifies subscribers (call inside `act`). */
  set(patch: Partial<DeviceSessionState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
}

/**
 * Selector hook over a {@link FakeSession}, with the same "re-render only
 * when the slice changed" behaviour as the real `useDeviceSessionSelector`.
 */
export function useFakeSelector<T>(
  fake: FakeSession,
  selector: (s: DeviceSessionState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const last = useRef<{ state: DeviceSessionState; value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = fake.getState();
    if (last.current && last.current.state === state) return last.current.value;
    const value = selector(state);
    if (last.current && isEqual(last.current.value, value)) {
      last.current = { state, value: last.current.value };
    } else {
      last.current = { state, value };
    }
    return last.current.value;
  }, [fake, selector, isEqual]);
  return useSyncExternalStore(fake.subscribe, getSnapshot);
}

/**
 * Factory body for `vi.mock("<path>/actions/session", (orig) => sessionMock(orig, () => fake))`:
 * keeps the real selectors but reads from a {@link FakeSession}.
 * @param importOriginal - The `importOriginal` argument of the vi.mock factory
 * @param getFake - Returns the fake used by the current test
 * @returns The replacement module
 */
export async function sessionMock(
  importOriginal: () => Promise<typeof import("./session")>,
  getFake: () => FakeSession,
): Promise<typeof import("./session")> {
  const actual = await importOriginal();
  return {
    ...actual,
    useDeviceSessionSelector: ((_id: string, selector: never, isEqual: never) =>
      useFakeSelector(getFake(), selector, isEqual)) as typeof actual.useDeviceSessionSelector,
    useActionModel: () => useFakeSelector(getFake(), actual.selectActionModel, actual.sameActionModel),
    useDeviceActions: () => getFake().actions as unknown as DeviceSessionActions,
  };
}
