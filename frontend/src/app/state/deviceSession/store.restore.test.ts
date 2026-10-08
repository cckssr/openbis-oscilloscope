import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as devices from "../../../api/devices";
import * as sessions from "../../../api/sessions";
import { DeviceSessionStore } from "./store";
import { FakeScope, installFakeApi, makeArtifact, noChannel } from "./testing";

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
let store: DeviceSessionStore;

function make() {
  store = new DeviceSessionStore({
    deviceId: "scope-01",
    token: "tok",
    createChannel: noChannel,
  });
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

describe("settings preload on start", () => {
  it("makes settings.applied available before the device is taken", async () => {
    await make().start();
    const s = store.getState();
    expect(s.lock.status).toBe("none");
    expect(s.settings.applied?.channels[1].enabled).toBe(true);
    expect(devices.sendHeartbeat).not.toHaveBeenCalled();
  });

  it("is silent when the device cannot be read, and the post-take reload still runs", async () => {
    vi.mocked(devices.getSettings).mockRejectedValueOnce(new Error("offline"));
    await make().start();
    expect(store.getState().settings.applied).toBeNull();
    const { toast } = await import("sonner");
    expect(toast.error).not.toHaveBeenCalled();

    await store.actions.takeControl();
    expect(store.getState().settings.applied).not.toBeNull();
  });

  it("does not overwrite settings that are loaded already", async () => {
    scope.device.lock = MINE;
    await make().start();
    expect(devices.getSettings).toHaveBeenCalledTimes(2); // preload + reclaim reload
    expect(store.getState().settings.applied).not.toBeNull();
  });
});

describe("restore last capture after a reclaim", () => {
  function archive() {
    scope.artifacts = [
      makeArtifact("a1", {
        acquisition_id: "A",
        channel: 1,
        created_at: "2026-10-08T09:00:00Z",
      }),
      makeArtifact("b1", {
        acquisition_id: "B",
        channel: 1,
        created_at: "2026-10-08T10:00:00Z",
        annotation: "RC-Glied",
        persist: true,
      }),
      makeArtifact("b2", {
        acquisition_id: "B",
        channel: 2,
        created_at: "2026-10-08T10:00:01Z",
        annotation: "RC-Glied",
        persist: true,
      }),
    ];
  }

  it("restores lastCapture and the plot from the newest acquisition", async () => {
    scope.device.lock = MINE;
    archive();
    await make().start();

    const s = store.getState();
    expect(s.lastCapture).toMatchObject({
      acquisitionId: "B",
      artifactIds: ["b1", "b2"],
      createdAt: "2026-10-08T10:00:01Z",
      number: 2,
      note: "RC-Glied",
      flagged: true,
    });
    expect(sessions.getArtifactWaveform).toHaveBeenCalledTimes(2);
    expect(s.frame?.source).toBe("capture");
    expect(s.frame?.traces.map((t) => t.id)).toEqual(["CH1", "CH2"]);
    expect(s.lastCapture?.frame).toBe(s.frame);
    expect(s.frame?.timebase.sampleRate).toBeCloseTo(1e6);
  });

  it("keeps lastCapture (note, flag) when the waveforms cannot be loaded", async () => {
    scope.device.lock = MINE;
    archive();
    vi.mocked(sessions.getArtifactWaveform).mockRejectedValue(
      new Error("gone"),
    );
    await make().start();

    const s = store.getState();
    expect(s.lastCapture).toMatchObject({
      acquisitionId: "B",
      note: "RC-Glied",
    });
    expect(s.lastCapture?.frame.traces).toEqual([]);
    expect(s.frame).toBeNull();
  });

  it("does nothing for an empty archive or when taking a fresh lock", async () => {
    scope.device.lock = MINE;
    await make().start();
    expect(store.getState().lastCapture).toBeNull();

    store.dispose();
    scope.device.lock = null; // a new session starts with an empty archive
    await make().start();
    await store.actions.takeControl();
    expect(store.getState().lastCapture).toBeNull(); // new session id, nothing to restore
  });

  it("does not replace a capture saved in the meantime", async () => {
    scope.device.lock = MINE;
    archive();
    await make().start();
    await store.actions.saveCapture();
    const saved = store.getState().lastCapture;
    await store.actions.refreshDevice();
    expect(store.getState().lastCapture).toBe(saved);
  });
});
