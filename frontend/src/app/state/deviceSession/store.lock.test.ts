import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import * as devices from "../../../api/devices";
import { ApiError } from "../../../api/client";
import * as config from "../../../api/config";
import { DeviceSessionStore } from "./store";
import {
  FakeChannelHub,
  FakeScope,
  installFakeApi,
  noChannel,
} from "./testing";

vi.mock("../../../api/devices");
vi.mock("../../../api/sessions");
vi.mock("../../../api/events");
vi.mock("../../../api/config");
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const MINE = {
  owner_user: "me",
  acquired_at: 1,
  is_mine: true,
  session_id: "sess-old",
};

let scope: FakeScope;
let stores: DeviceSessionStore[];

function makeStore(createChannel = noChannel, tabId?: string) {
  const store = new DeviceSessionStore({
    deviceId: "scope-01",
    token: "tok",
    createChannel,
    tabId,
  });
  stores.push(store);
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  stores = [];
  scope = installFakeApi();
});

afterEach(() => {
  stores.forEach((s) => s.dispose());
  vi.useRealTimers();
});

describe("lock: reclaim and take", () => {
  it("reclaims our own server-side lock without acquiring a new one", async () => {
    scope.device.lock = MINE;
    const store = makeStore();
    await store.start();

    expect(devices.acquireLock).not.toHaveBeenCalled();
    const s = store.getState();
    expect(s.lock).toMatchObject({ status: "held", sessionId: "sess-old" });
    expect(s.settings.applied).not.toBeNull();
    expect(s.memoryDepth).toBe(12000);
    expect(s.channelCount).toBe(4);
  });

  it("heartbeats every min(60 s, ttl/5)", async () => {
    scope.device.lock = MINE;
    const store = makeStore();
    await store.start();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(devices.sendHeartbeat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(devices.sendHeartbeat).toHaveBeenCalledWith(
      "tok",
      "scope-01",
      "sess-old",
    );

    vi.mocked(config.getConfig).mockResolvedValue({
      ...(await config.getConfig()),
      lock_ttl_seconds: 50,
    });
    vi.mocked(devices.sendHeartbeat).mockClear();
    const other = makeStore();
    scope.device.lock = { ...MINE, session_id: "sess-2" };
    await other.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(devices.sendHeartbeat).toHaveBeenCalledWith(
      "tok",
      "scope-01",
      "sess-2",
    );
  });

  it("takeControl acquires, then loads settings, memory depth and counts", async () => {
    const store = makeStore();
    await store.start();
    expect(store.getState().lock.status).toBe("none");

    await store.actions.takeControl();
    const s = store.getState();
    expect(devices.acquireLock).toHaveBeenCalledTimes(1);
    expect(s.lock).toMatchObject({ status: "held", sessionId: "session-1" });
    expect(s.lock.since).toBeTypeOf("number");
    expect(s.settings.applied?.channels[1].enabled).toBe(true);
    expect(s.memoryDepth).toBe(12000);
    expect(s.jobs[0]).toMatchObject({ kind: "take-control", status: "done" });
  });

  it("a failed takeControl reports a toast and leaves the lock at none", async () => {
    vi.mocked(devices.acquireLock).mockRejectedValue(
      new ApiError(409, "device_locked", "Gerät gesperrt"),
    );
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();

    expect(store.getState().lock.status).toBe("none");
    expect(store.getState().lock.error).toBe("Gerät gesperrt");
    expect(toast.error).toHaveBeenCalled();
    expect(store.getState().jobs[0].status).toBe("error");
  });
});

describe("lock: loss and release", () => {
  it("a failing heartbeat marks the lock lost, stops live and keeps the last frame", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    await store.actions.startLive();
    await vi.advanceTimersByTimeAsync(600);
    const frame = store.getState().frame;
    expect(frame?.source).toBe("live");

    vi.mocked(devices.sendHeartbeat).mockRejectedValue(
      new ApiError(409, "lock_lost", "weg"),
    );
    await vi.advanceTimersByTimeAsync(60_000);

    const s = store.getState();
    expect(s.lock.status).toBe("lost");
    expect(s.lock.error).toMatch(/Sperre/);
    expect(s.live.status).toBe("off");
    expect(s.frame).not.toBeNull();

    const calls = vi.mocked(devices.previewWaveforms).mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(vi.mocked(devices.previewWaveforms).mock.calls.length).toBe(calls);
    expect(devices.sendHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("retries a network error once before declaring the lock lost", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    vi.mocked(devices.sendHeartbeat).mockRejectedValueOnce(
      new TypeError("offline"),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.getState().lock.status).toBe("held");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(store.getState().lock.status).toBe("held"); // retry succeeded
  });

  it("release keeps frame and last capture and remembers the session", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    await store.actions.saveCapture();
    const { frame, lastCapture } = store.getState();
    expect(lastCapture).not.toBeNull();

    await store.actions.release();
    const s = store.getState();
    expect(devices.releaseLock).toHaveBeenCalledWith(
      "tok",
      "scope-01",
      "session-1",
    );
    expect(s.lock).toEqual({ status: "none", previousSessionId: "session-1" });
    expect(s.frame).toBe(frame);
    expect(s.lastCapture).toBe(lastCapture);

    vi.mocked(devices.sendHeartbeat).mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(devices.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("a new session starts with a clean plot and counts", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    await store.actions.saveCapture();
    await store.actions.release();
    scope.artifacts = [];
    await store.actions.takeControl();
    const s = store.getState();
    expect(s.lock.sessionId).toBe("session-2");
    expect(s.frame).toBeNull();
    expect(s.lastCapture).toBeNull();
    expect(s.counts.total).toBe(0);
  });
});

describe("lock: page unload", () => {
  it("the controlling tab soft-releases on pagehide, never a hard unlock", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    window.dispatchEvent(new Event("pagehide"));
    expect(devices.softReleaseLockOnUnload).toHaveBeenCalledWith(
      "tok",
      "scope-01",
      "session-1",
    );
    expect(devices.releaseLock).not.toHaveBeenCalled();
  });

  it("ignores beforeunload (the user may cancel the leave prompt and stay)", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    window.dispatchEvent(new Event("beforeunload"));
    expect(devices.softReleaseLockOnUnload).not.toHaveBeenCalled();
  });

  it("sends nothing when the tab does not control the device", async () => {
    const store = makeStore();
    await store.start();
    window.dispatchEvent(new Event("pagehide"));
    expect(devices.softReleaseLockOnUnload).not.toHaveBeenCalled();
  });

  it("sends nothing after dispose", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    store.dispose();
    window.dispatchEvent(new Event("pagehide"));
    expect(devices.softReleaseLockOnUnload).not.toHaveBeenCalled();
  });
});

describe("lock: second tab", () => {
  it("a second tab becomes passive when another tab controls the lock", async () => {
    const hub = new FakeChannelHub();
    const a = makeStore(hub.factory, "tab-a");
    await a.start();
    await a.actions.takeControl();
    scope.device.lock = { ...MINE, session_id: "session-1" };

    const b = makeStore(hub.factory, "tab-b");
    const started = b.start();
    await vi.advanceTimersByTimeAsync(400);
    await started;

    expect(b.getState().lock).toMatchObject({
      status: "passive",
      sessionId: "session-1",
    });
    expect(a.getState().lock.status).toBe("held");

    // The passive tab sends no heartbeat.
    vi.mocked(devices.sendHeartbeat).mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(devices.sendHeartbeat).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("pagehide"));
    expect(devices.softReleaseLockOnUnload).toHaveBeenCalledTimes(1); // only tab A, B is passive
  });

  it("takeControl in the passive tab takes over; the other tab turns passive and keeps the lock", async () => {
    const hub = new FakeChannelHub();
    const a = makeStore(hub.factory, "tab-a");
    await a.start();
    await a.actions.takeControl();
    await a.actions.startLive();
    scope.device.lock = { ...MINE, session_id: "session-1" };
    const b = makeStore(hub.factory, "tab-b");
    const started = b.start();
    await vi.advanceTimersByTimeAsync(400);
    await started;

    await b.actions.takeControl();
    await vi.advanceTimersByTimeAsync(10);

    expect(devices.acquireLock).toHaveBeenCalledTimes(1); // no new lock
    expect(b.getState().lock.status).toBe("held");
    expect(a.getState().lock).toMatchObject({
      status: "passive",
      sessionId: "session-1",
    });
    expect(a.getState().live.status).toBe("off");

    vi.mocked(devices.sendHeartbeat).mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(devices.sendHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("passive tabs follow a release of the controlling tab", async () => {
    const hub = new FakeChannelHub();
    const a = makeStore(hub.factory, "tab-a");
    await a.start();
    await a.actions.takeControl();
    scope.device.lock = { ...MINE, session_id: "session-1" };
    const b = makeStore(hub.factory, "tab-b");
    const started = b.start();
    await vi.advanceTimersByTimeAsync(400);
    await started;

    await a.actions.release();
    await vi.advanceTimersByTimeAsync(10);
    expect(b.getState().lock).toMatchObject({
      status: "none",
      previousSessionId: "session-1",
    });
  });

  it("without BroadcastChannel the tab behaves as a single tab", async () => {
    scope.device.lock = MINE;
    const store = makeStore(noChannel);
    await store.start();
    expect(store.getState().lock.status).toBe("held");
  });
});

describe("dispose", () => {
  it("stops timers and ignores later actions without throwing", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    await store.actions.startLive();
    store.dispose();
    const listener = vi.fn();
    store.subscribe(listener);
    vi.mocked(devices.previewWaveforms).mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(devices.previewWaveforms).not.toHaveBeenCalled();
    expect(devices.sendHeartbeat).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    await expect(store.actions.saveCapture()).resolves.toBeNull();
  });
});

describe("lock: release with loops", () => {
  it("stops a running series before releasing", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    store.actions.startSeries();
    await vi.advanceTimersByTimeAsync(1_200);
    await store.actions.release();
    expect(devices.releaseLock).toHaveBeenCalledTimes(1);
    expect(store.getState().series.status).toBe("off");
    expect(store.getState().lock.status).toBe("none");
  });

  it("refuses to release while a command still runs", async () => {
    const store = makeStore();
    await store.start();
    await store.actions.takeControl();
    vi.mocked(devices.acquireWaveforms).mockImplementation(
      () => new Promise(() => undefined),
    );
    void store.actions.saveFullResolution();
    await vi.advanceTimersByTimeAsync(10);
    await store.actions.release();
    expect(devices.releaseLock).not.toHaveBeenCalled();
    expect(store.getState().lock.status).toBe("held");
    expect(toast.error).toHaveBeenCalled();
  });

  it("uses the server's acquisition time as `since` of a reclaimed lock", async () => {
    scope.device.lock = { ...MINE, acquired_at: 1_700_000_000 };
    const store = makeStore();
    await store.start();
    expect(store.getState().lock.since).toBe(1_700_000_000_000);
  });
});
