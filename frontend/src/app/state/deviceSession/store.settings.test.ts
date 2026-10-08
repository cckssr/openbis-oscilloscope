import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import * as devices from "../../../api/devices";
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

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  scope = installFakeApi();
  store = new DeviceSessionStore({
    deviceId: "scope-01",
    token: "tok",
    createChannel: noChannel,
  });
  await store.start();
  await store.actions.takeControl();
});

afterEach(() => {
  store.dispose();
  vi.useRealTimers();
});

describe("settings: apply immediately", () => {
  it("marks a change pending and writes after the debounce", async () => {
    store.actions.setSetting("channels.1.scale_v_div", 0.5);
    let s = store.getState().settings;
    expect(s.pending["channels.1.scale_v_div"]).toBe(0.5);
    expect(s.status["channels.1.scale_v_div"]?.state).toBe("pending");
    expect(s.applied?.channels[1].scale_v_div).toBe(1); // overlays still use applied
    expect(devices.setChannelConfig).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(399);
    expect(devices.setChannelConfig).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);

    expect(devices.setChannelConfig).toHaveBeenCalledWith(
      "tok",
      "scope-01",
      1,
      "session-1",
      {
        enabled: true,
        scale_v_div: 0.5,
        offset_v: 0,
        coupling: "DC",
        probe_attenuation: 1,
      },
    );
    s = store.getState().settings;
    expect(s.applied?.channels[1].scale_v_div).toBe(0.5);
    expect(s.pending).toEqual({});
    expect(s.status["channels.1.scale_v_div"]?.state).toBe("applied");
    expect(s.touched).toBe(true);
  });

  it("merges edits of one group into a single write and resets the debounce", async () => {
    store.actions.setSetting("channels.1.scale_v_div", 0.5);
    await vi.advanceTimersByTimeAsync(300);
    store.actions.setSetting("channels.1.offset_v", 0.25);
    await vi.advanceTimersByTimeAsync(300);
    expect(devices.setChannelConfig).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);

    expect(devices.setChannelConfig).toHaveBeenCalledTimes(1);
    expect(vi.mocked(devices.setChannelConfig).mock.calls[0][4]).toMatchObject({
      scale_v_div: 0.5,
      offset_v: 0.25,
      enabled: true,
    });
  });

  it("writes different groups separately", async () => {
    store.actions.setSetting("channels.2.coupling", "AC");
    store.actions.setSetting("trigger.level_v", 0.3);
    store.actions.setSetting("timebase.scale_s_div", 2e-3);
    await vi.advanceTimersByTimeAsync(500);
    expect(devices.setChannelConfig).toHaveBeenCalledTimes(1);
    expect(devices.setTrigger).toHaveBeenCalledWith(
      "tok",
      "scope-01",
      "session-1",
      expect.objectContaining({ level_v: 0.3, source: "CH1" }),
    );
    expect(devices.setTimebase).toHaveBeenCalledWith(
      "tok",
      "scope-01",
      "session-1",
      {
        scale_s_div: 2e-3,
        offset_s: 0,
      },
    );
    expect(devices.getMemoryDepth).toHaveBeenCalledTimes(2); // load + after the timebase change
  });

  it("reverts to the applied value and toasts when the scope refuses", async () => {
    vi.mocked(devices.setTrigger).mockRejectedValue(
      new ApiError(400, "bad", "Pegel außerhalb"),
    );
    store.actions.setSetting("trigger.level_v", 99);
    await vi.advanceTimersByTimeAsync(500);

    const s = store.getState().settings;
    expect(s.pending).toEqual({});
    expect(s.applied?.trigger.level_v).toBe(0);
    expect(s.status["trigger.level_v"]).toMatchObject({
      state: "error",
      error: "Pegel außerhalb",
    });
    expect(toast.error).toHaveBeenCalledWith("Einstellung nicht übernommen", {
      description: "Pegel außerhalb",
    });
    expect(store.getState().busy).toBeNull();
  });

  it("an edit made while writing stays pending and is written afterwards", async () => {
    let release!: () => void;
    vi.mocked(devices.setTrigger).mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    store.actions.setSetting("trigger.level_v", 0.1);
    await vi.advanceTimersByTimeAsync(450);
    expect(store.getState().settings.status["trigger.level_v"]?.state).toBe(
      "applying",
    );
    expect(store.getState().busy).toMatch(/Einstellung/);

    store.actions.setSetting("trigger.level_v", 0.2);
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(store.getState().settings.pending["trigger.level_v"]).toBe(0.2);

    await vi.advanceTimersByTimeAsync(500);
    expect(devices.setTrigger).toHaveBeenCalledTimes(2);
    expect(store.getState().settings.applied?.trigger.level_v).toBe(0.2);
    expect(store.getState().settings.pending).toEqual({});
  });

  it("setting a value back to the applied one cancels the write", async () => {
    store.actions.setSetting("channels.1.scale_v_div", 0.5);
    store.actions.setSetting("channels.1.scale_v_div", 1);
    expect(store.getState().settings.pending).toEqual({});
    await vi.advanceTimersByTimeAsync(1_000);
    expect(devices.setChannelConfig).not.toHaveBeenCalled();
  });

  it("shows values the scope rounded after the write", async () => {
    vi.mocked(devices.setTimebase).mockImplementation(
      async (_t, _i, _s, cfg) => {
        scope.settings.timebase = {
          ...scope.settings.timebase,
          ...cfg,
          scale_s_div: 1e-3,
          sample_rate: 5e5,
        };
      },
    );
    store.actions.setSetting("timebase.scale_s_div", 1.3e-3);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().settings.applied?.timebase).toMatchObject({
      scale_s_div: 1e-3,
      sample_rate: 5e5,
    });
  });

  it("reloadSettings re-reads the scope and drops pending edits", async () => {
    store.actions.setSetting("trigger.level_v", 0.7);
    scope.settings.trigger = { ...scope.settings.trigger, level_v: -0.2 };
    await store.actions.reloadSettings();
    const s = store.getState().settings;
    expect(s.pending).toEqual({});
    expect(s.applied?.trigger.level_v).toBe(-0.2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(devices.setTrigger).not.toHaveBeenCalled();
  });

  it("autoscale reloads the settings and marks step 2 as touched", async () => {
    scope.settings.channels[1] = {
      ...scope.settings.channels[1],
      scale_v_div: 0.2,
    };
    await store.actions.autoscale();
    expect(devices.sendScopeCommand).toHaveBeenCalledWith(
      "tok",
      "scope-01",
      "session-1",
      "autoscale",
    );
    const s = store.getState();
    expect(s.settings.touched).toBe(true);
    expect(s.settings.applied?.channels[1].scale_v_div).toBe(0.2);
    expect(s.jobs[0]).toMatchObject({ kind: "autoscale", status: "done" });
  });

  it("ignores edits when this tab does not control the device", async () => {
    await store.actions.release();
    store.actions.setSetting("trigger.level_v", 0.4);
    expect(store.getState().settings.pending).toEqual({});
  });
});
