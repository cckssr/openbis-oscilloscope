import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import * as devices from "../../../api/devices";
import * as events from "../../../api/events";
import * as sessions from "../../../api/sessions";
import { ApiError } from "../../../api/client";
import type { DeviceEvent } from "../../../api/types";
import { DeviceSessionStore } from "./store";
import { FakeScope, installFakeApi, makeArtifact, noChannel } from "./testing";

vi.mock("../../../api/devices");
vi.mock("../../../api/sessions");
vi.mock("../../../api/events");
vi.mock("../../../api/config");
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

let scope: FakeScope;
let store: DeviceSessionStore;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  scope = installFakeApi();
  store = new DeviceSessionStore({ deviceId: "scope-01", token: "tok", createChannel: noChannel });
  await store.start();
  await store.actions.takeControl();
});

afterEach(() => {
  store.dispose();
  vi.useRealTimers();
});

describe("full resolution", () => {
  it("maps SSE progress of this device and session to the job, then ends done", async () => {
    let emit!: (e: DeviceEvent) => void;
    const unsubscribe = vi.fn();
    vi.mocked(events.subscribeDeviceEvents).mockImplementation((_t, onEvent) => {
      emit = onEvent;
      return unsubscribe;
    });
    let finish!: () => void;
    const original = vi.mocked(devices.acquireWaveforms).getMockImplementation()!;
    vi.mocked(devices.acquireWaveforms).mockImplementation(
      (...args) => new Promise((resolve) => (finish = () => resolve(original(...args)))),
    );

    const pending = store.actions.saveFullResolution();
    await vi.advanceTimersByTimeAsync(10);
    let job = store.getState().jobs[0];
    expect(job).toMatchObject({ kind: "full-resolution", cancellable: true, status: "running" });
    expect(job.progress).toBeUndefined(); // indeterminate until events arrive
    expect(store.getState().busy).toBe("Volle Auflösung wird gelesen…");

    emit({ type: "progress", device_id: "other", session_id: "session-1", job: "acquire", done: 0.9, detail: "x" });
    emit({ type: "progress", device_id: "scope-01", session_id: "stale", job: "acquire", done: 0.9, detail: "x" });
    expect(store.getState().jobs[0].progress).toBeUndefined();
    emit({ type: "progress", device_id: "scope-01", session_id: "session-1", job: "acquire", done: 0.4, detail: "CH2: 1,2 / 6 MPkt" });
    job = store.getState().jobs[0];
    expect(job).toMatchObject({ progress: 0.4, detail: "CH2: 1,2 / 6 MPkt" });

    finish();
    const capture = await pending;
    expect(capture).toMatchObject({ fullResolution: true, number: 1 });
    expect(store.getState().jobs[0]).toMatchObject({ status: "done", progress: 1 });
    expect(unsubscribe).toHaveBeenCalled();
    expect(vi.mocked(devices.acquireWaveforms).mock.calls[0][3]).toMatchObject({ maxSamples: true });
  });

  it("cancel ends the job as cancelled without an error toast and stores nothing", async () => {
    let fail!: () => void;
    vi.mocked(devices.acquireWaveforms).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new ApiError(409, "acquisition_cancelled", "abgebrochen"));
        }),
    );
    vi.mocked(devices.cancelAcquire).mockImplementation(async () => {
      fail();
      return { cancelled: true };
    });
    const before = store.getState();
    const pending = store.actions.saveFullResolution();
    await vi.advanceTimersByTimeAsync(10);

    await store.actions.cancelFullResolution();
    expect(devices.cancelAcquire).toHaveBeenCalledWith("tok", "scope-01", "session-1");
    expect(await pending).toBeNull();

    const s = store.getState();
    expect(s.jobs[0]).toMatchObject({ kind: "full-resolution", status: "cancelled" });
    expect(toast.error).not.toHaveBeenCalled();
    expect(s.lastCapture).toBe(before.lastCapture);
    expect(s.counts.total).toBe(0);
    expect(s.busy).toBeNull();
  });

  it("a cancel pressed while the read still waits in the queue cancels it", async () => {
    let release!: () => void;
    vi.mocked(devices.sendScopeCommand).mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    void store.actions.forceTrigger(); // occupies the queue
    const pending = store.actions.saveFullResolution();
    await vi.advanceTimersByTimeAsync(10);
    await store.actions.cancelFullResolution();
    release();
    expect(await pending).toBeNull();
    expect(devices.acquireWaveforms).not.toHaveBeenCalled();
    expect(store.getState().jobs.find((j) => j.kind === "full-resolution")?.status).toBe("cancelled");
  });

  it("blocks other commands (busy) while it runs", async () => {
    vi.mocked(devices.acquireWaveforms).mockImplementation(() => new Promise(() => undefined));
    void store.actions.saveFullResolution();
    await vi.advanceTimersByTimeAsync(10);
    expect(store.getState().busy).toBe("Volle Auflösung wird gelesen…");
    const second = store.actions.saveCapture();
    expect(await second).toBeNull(); // refused while a capture is in flight
    expect(devices.acquireWaveforms).toHaveBeenCalledTimes(1);
  });
});

describe("series", () => {
  it("saves about one capture per second under one run id until stopped", async () => {
    store.actions.startSeries();
    expect(store.getState().series).toMatchObject({ status: "on", count: 0 });
    await vi.advanceTimersByTimeAsync(3_500);
    const calls = vi.mocked(devices.acquireWaveforms).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.length).toBeLessThanOrEqual(4);
    const runIds = new Set(calls.map((c) => c[3]?.runId));
    expect(runIds.size).toBe(1);
    expect([...runIds][0]).toBeTruthy();
    expect(store.getState().series.count).toBe(calls.length);
    expect(store.getState().counts.total).toBe(calls.length);
    expect(toast.success).not.toHaveBeenCalled(); // no toast per capture

    store.actions.stopSeries();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(vi.mocked(devices.acquireWaveforms).mock.calls.length).toBe(calls.length);
    expect(store.getState().series.status).toBe("off");
    expect(store.getState().jobs.find((j) => j.kind === "series")?.status).toBe("done");
  });

  it("stops by itself when a capture fails", async () => {
    vi.mocked(devices.acquireWaveforms).mockRejectedValue(new ApiError(500, "x", "kaputt"));
    store.actions.startSeries();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(store.getState().series.status).toBe("off");
    expect(devices.acquireWaveforms).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("counts", () => {
  it("groups traces per acquisition and counts screenshots individually", async () => {
    scope.artifacts = [
      makeArtifact("a1", { acquisition_id: "A", persist: true }),
      makeArtifact("a2", { acquisition_id: "A", persist: true, channel: 2 }),
      makeArtifact("b1", { acquisition_id: "B", annotation: "Notiz" }),
      makeArtifact("c1", { acquisition_id: "C", uploaded: true }),
      makeArtifact("s1", { artifact_type: "screenshot", channel: null }),
    ];
    await store.actions.refreshCounts();
    expect(store.getState().counts).toEqual({
      total: 4,
      withNoteOrFlag: 3,
      flagged: 1,
      uploaded: 1,
      notUploaded: 3,
    });
    expect(sessions.listArtifacts).toHaveBeenCalledWith("tok", "session-1");
  });

  it("treats a missing `uploaded` field of an old backend as false", async () => {
    const legacy = { ...makeArtifact("x", { acquisition_id: "A" }) } as Partial<ReturnType<typeof makeArtifact>>;
    delete legacy.uploaded;
    scope.artifacts = [legacy as ReturnType<typeof makeArtifact>];
    await store.actions.refreshCounts();
    expect(store.getState().counts).toMatchObject({ total: 1, uploaded: 0, notUploaded: 1 });
  });

  it("an explicit refresh failure toasts; the old counts stay", async () => {
    vi.mocked(sessions.listArtifacts).mockRejectedValue(new Error("offline"));
    await store.actions.refreshCounts();
    expect(toast.error).toHaveBeenCalled();
    expect(store.getState().counts.total).toBe(0);
  });
});
