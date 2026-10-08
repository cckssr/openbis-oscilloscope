import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import * as devices from "../../../api/devices";
import * as sessions from "../../../api/sessions";
import { ApiError } from "../../../api/client";
import { DeviceSessionStore } from "./store";
import { FakeScope, installFakeApi, noChannel } from "./testing";

vi.mock("../../../api/devices");
vi.mock("../../../api/sessions");
vi.mock("../../../api/events");
vi.mock("../../../api/config");
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

let scope: FakeScope;
let store: DeviceSessionStore;

async function controlled(): Promise<DeviceSessionStore> {
  store = new DeviceSessionStore({ deviceId: "scope-01", token: "tok", createChannel: noChannel });
  await store.start();
  await store.actions.takeControl();
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  scope = installFakeApi();
});

afterEach(() => {
  store?.dispose();
  vi.useRealTimers();
});

describe("live preview", () => {
  it("runs the scope, loops sequentially and stores nothing", async () => {
    await controlled();
    await store.actions.startLive();
    expect(devices.runDevice).toHaveBeenCalledTimes(1);
    expect(store.getState().live.status).toBe("on");

    await vi.advanceTimersByTimeAsync(2_100);
    const frames = vi.mocked(devices.previewWaveforms).mock.calls.length;
    expect(frames).toBeGreaterThanOrEqual(4);
    expect(frames).toBeLessThanOrEqual(5); // min period 500 ms
    expect(devices.acquireWaveforms).not.toHaveBeenCalled();
    expect(sessions.setAnnotation).not.toHaveBeenCalled();
    expect(scope.artifacts).toHaveLength(0);

    const s = store.getState();
    expect(s.frame?.source).toBe("live");
    expect(s.live.lastFrameAt).toBeTypeOf("number");
    expect(s.lastCapture).toBeNull();
  });

  it("does not start a second request before the first one finished", async () => {
    await controlled();
    let resolveFrame: (() => void) | undefined;
    const original = vi.mocked(devices.previewWaveforms).getMockImplementation()!;
    vi.mocked(devices.previewWaveforms).mockImplementation((...args) =>
      new Promise((resolve) => {
        resolveFrame = () => resolve(original(...args));
      }),
    );
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(devices.previewWaveforms).toHaveBeenCalledTimes(1);
    resolveFrame!();
    await vi.advanceTimersByTimeAsync(600);
    expect(devices.previewWaveforms).toHaveBeenCalledTimes(2);
  });

  it("requests only channels enabled in the applied settings, not pending edits (A6)", async () => {
    await controlled();
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(10);
    expect(devices.previewWaveforms).toHaveBeenLastCalledWith("tok", "scope-01", "session-1", [1, 2]);

    // Unticking CH2 is only pending until the debounce fires.
    store.actions.setSetting("channels.2.enabled", false);
    await vi.advanceTimersByTimeAsync(300);
    expect(devices.previewWaveforms).toHaveBeenLastCalledWith("tok", "scope-01", "session-1", [1, 2]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(devices.previewWaveforms).toHaveBeenLastCalledWith("tok", "scope-01", "session-1", [1]);
  });

  it("frames update applied settings but never pending ones", async () => {
    await controlled();
    await store.actions.startLive();
    scope.settings.timebase = { ...scope.settings.timebase, scale_s_div: 2e-3 };
    await vi.advanceTimersByTimeAsync(600);
    expect(store.getState().settings.applied?.timebase.scale_s_div).toBe(2e-3);

    store.actions.setSetting("trigger.level_v", 0.5);
    scope.settings.trigger = { ...scope.settings.trigger, level_v: 0.1 };
    await vi.advanceTimersByTimeAsync(200);
    const s = store.getState().settings;
    expect(s.pending["trigger.level_v"]).toBe(0.5);
    expect(s.applied?.trigger.level_v).toBe(0); // frame did not overwrite it
  });

  it("stops after three consecutive failures with a toast", async () => {
    await controlled();
    vi.mocked(devices.previewWaveforms).mockRejectedValue(new ApiError(500, "boom", "kaputt"));
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(devices.previewWaveforms).toHaveBeenCalledTimes(3);
    expect(store.getState().live.status).toBe("off");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("a single failure is tolerated", async () => {
    await controlled();
    const ok = vi.mocked(devices.previewWaveforms).getMockImplementation()!;
    vi.mocked(devices.previewWaveforms).mockRejectedValueOnce(new Error("blip"));
    vi.mocked(devices.previewWaveforms).mockImplementation(ok);
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(1_200);
    expect(store.getState().live.status).toBe("on");
    expect(store.getState().frame).not.toBeNull();
  });

  it("startLive is a no-op while live runs (A7) and stopLive keeps the scope running", async () => {
    await controlled();
    await store.actions.startLive();
    await store.actions.startLive();
    expect(devices.runDevice).toHaveBeenCalledTimes(1);

    store.actions.stopLive();
    expect(store.getState().live.status).toBe("off");
    expect(devices.stopDevice).not.toHaveBeenCalled();
    vi.mocked(devices.previewWaveforms).mockClear();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(devices.previewWaveforms).not.toHaveBeenCalled();
  });

  it("stopScope sends STOP and ends live", async () => {
    await controlled();
    await store.actions.startLive();
    await store.actions.stopScope();
    expect(devices.stopDevice).toHaveBeenCalledTimes(1);
    expect(store.getState().live.status).toBe("off");
  });

  it("pauses when the page is left and resumes without a new RUN", async () => {
    await controlled();
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(600);
    store.actions.pauseLive();
    expect(store.getState().live.status).toBe("paused");
    vi.mocked(devices.previewWaveforms).mockClear();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(devices.previewWaveforms).not.toHaveBeenCalled();

    store.actions.resumeLive();
    await vi.advanceTimersByTimeAsync(600);
    expect(store.getState().live.status).toBe("on");
    expect(devices.previewWaveforms).toHaveBeenCalled();
    expect(devices.runDevice).toHaveBeenCalledTimes(1);
  });

  it("yields to queued user commands instead of starving them", async () => {
    await controlled();
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(600);
    vi.mocked(devices.previewWaveforms).mockClear();

    let release!: () => void;
    vi.mocked(devices.sendScopeCommand).mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const done = store.actions.forceTrigger();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.getState().busy).toMatch(/Trigger/);
    expect(devices.previewWaveforms).not.toHaveBeenCalled(); // loop waits for the command
    release();
    await done;
    await vi.advanceTimersByTimeAsync(600);
    expect(devices.previewWaveforms).toHaveBeenCalled();
    expect(store.getState().busy).toBeNull();
  });
});

describe("saveCapture", () => {
  it("stops live first, saves with applied channels and shows the capture", async () => {
    await controlled();
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(600);

    const capture = await store.actions.saveCapture();
    expect(capture).not.toBeNull();
    expect(store.getState().live.status).toBe("off");
    expect(devices.acquireWaveforms).toHaveBeenCalledWith("tok", "scope-01", "session-1", {
      channels: [1, 2],
      maxSamples: false,
      runId: undefined,
      includeData: true,
    });
    const s = store.getState();
    expect(s.frame?.source).toBe("capture");
    expect(s.lastCapture).toMatchObject({ number: 1, note: "", flagged: false, fullResolution: false });
    expect(s.counts.total).toBe(1);
    expect(toast.success).toHaveBeenCalledWith("Aufnahme #1 gespeichert", undefined);
  });

  it("discards an in-flight live frame so it cannot overwrite the capture", async () => {
    await controlled();
    const original = vi.mocked(devices.previewWaveforms).getMockImplementation()!;
    let releaseFrame!: () => void;
    vi.mocked(devices.previewWaveforms).mockImplementation(
      (...args) => new Promise((resolve) => (releaseFrame = () => resolve(original(...args)))),
    );
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(10);
    const pending = store.actions.saveCapture();
    await vi.advanceTimersByTimeAsync(10);
    expect(devices.acquireWaveforms).not.toHaveBeenCalled(); // waits for the frame
    releaseFrame();
    await pending;
    expect(store.getState().frame?.source).toBe("capture");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(store.getState().frame?.source).toBe("capture");
  });

  it("keeps the note across later live frames (A4)", async () => {
    await controlled();
    await store.actions.saveCapture();
    await store.actions.saveNote("Messung RC-Glied", true);
    const note = store.getState().lastCapture;
    expect(note).toMatchObject({ note: "Messung RC-Glied", flagged: true });
    expect(sessions.setAnnotation).toHaveBeenCalledWith("tok", "session-1", "acq-1", "Messung RC-Glied");
    expect(sessions.flagArtifact).toHaveBeenCalledTimes(2);

    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(store.getState().frame?.source).toBe("live");
    expect(store.getState().lastCapture?.note).toBe("Messung RC-Glied");
    expect(store.getState().lastCapture).toBe(note);
  });

  it("refuses to capture when no channel is enabled", async () => {
    await controlled();
    store.actions.setSetting("channels.1.enabled", false);
    store.actions.setSetting("channels.2.enabled", false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await store.actions.saveCapture()).toBeNull();
    expect(devices.acquireWaveforms).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("reports a failed capture and keeps the previous plot", async () => {
    await controlled();
    await store.actions.saveCapture();
    const before = store.getState().frame;
    vi.mocked(devices.acquireWaveforms).mockRejectedValue(new ApiError(500, "x", "Lesefehler"));
    expect(await store.actions.saveCapture()).toBeNull();
    expect(store.getState().frame).toBe(before);
    expect(toast.error).toHaveBeenCalledWith("Aufnahme fehlgeschlagen", { description: "Lesefehler" });
    expect(store.getState().jobs[0].status).toBe("error");
  });

  it("setCaptureFlag flags every artifact of the capture", async () => {
    await controlled();
    await store.actions.saveCapture();
    await store.actions.setCaptureFlag(true);
    expect(sessions.flagArtifact).toHaveBeenCalledWith("tok", "session-1", "acq-1-ch1", true);
    expect(sessions.flagArtifact).toHaveBeenCalledWith("tok", "session-1", "acq-1-ch2", true);
    expect(store.getState().lastCapture?.flagged).toBe(true);
  });

  it("saveScreenshot stores one screenshot as a job and returns the artifact id", async () => {
    await controlled();
    const res = await store.actions.saveScreenshot();
    expect(res).toEqual({ artifactId: "shot-1" });
    expect(store.getState().counts.total).toBe(1);
    expect(store.getState().jobs[0]).toMatchObject({ kind: "screenshot", status: "done" });
  });
});
