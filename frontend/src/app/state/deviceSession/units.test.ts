import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/client";
import { CommandQueue } from "./commandQueue";
import { countsFromArtifacts } from "./captureCounts";
import { Heartbeat } from "./heartbeat";
import { JobTracker, FINISHED_JOB_TTL_MS, MAX_JOBS } from "./jobs";
import { createInitialState } from "./initialState";
import { mergeFrameIntoApplied } from "./settingsPaths";
import { SelectorCache } from "./selectorCache";
import { makeArtifact, makeSettings } from "./testing";
import type { DeviceSessionState } from "./types";
import type { StoreHost } from "./context";

vi.mock("../../../api/devices");

describe("CommandQueue", () => {
  it("runs commands one at a time in order and publishes busy", async () => {
    const busy: Array<string | null> = [];
    const queue = new CommandQueue(
      (b) => busy.push(b),
      () => false,
    );
    const order: string[] = [];
    let release!: () => void;
    const a = queue.run("A", async () => {
      order.push("a-start");
      await new Promise<void>((r) => (release = r));
      order.push("a-end");
    });
    const b = queue.run("B", async () => {
      order.push("b");
    });
    await Promise.resolve();
    expect(order).toEqual(["a-start"]);
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(["a-start", "a-end", "b"]);
    expect(busy[0]).toBe("A");
    expect(busy).toContain("B");
    expect(busy.at(-1)).toBeNull();
    expect(queue.isIdle).toBe(true);
  });

  it("a failing command does not block the next one", async () => {
    const queue = new CommandQueue(
      () => {},
      () => false,
    );
    const failing = queue.run("x", () => Promise.reject(new Error("no")));
    const ok = queue.run("y", async () => 42);
    await expect(failing).rejects.toThrow("no");
    await expect(ok).resolves.toBe(42);
  });

  it("skips queued commands after dispose", async () => {
    let disposed = false;
    const queue = new CommandQueue(
      () => {},
      () => disposed,
    );
    const fn = vi.fn(async () => 1);
    let release!: () => void;
    void queue.run("a", () => new Promise<void>((r) => (release = r)));
    const second = queue.run("b", fn);
    await Promise.resolve();
    disposed = true;
    release();
    await expect(second).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("countsFromArtifacts", () => {
  it("is empty for no artifacts", () => {
    expect(countsFromArtifacts([])).toEqual({
      total: 0,
      withNoteOrFlag: 0,
      flagged: 0,
      uploaded: 0,
      notUploaded: 0,
    });
  });

  it("counts legacy traces without acquisition id individually", () => {
    const counts = countsFromArtifacts([makeArtifact("a"), makeArtifact("b")]);
    expect(counts.total).toBe(2);
  });
});

describe("JobTracker", () => {
  function makeHost() {
    let state: DeviceSessionState = createInitialState("d");
    const host: StoreHost = {
      deviceId: "d",
      token: "t",
      getState: () => state,
      update: (fn) => {
        state = fn(state);
      },
      isDisposed: () => false,
      now: () => Date.now(),
    };
    return { host, get: () => state };
  }

  it("drops finished jobs after the TTL and keeps at most ten", () => {
    vi.useFakeTimers();
    const { host, get } = makeHost();
    const jobs = new JobTracker(host);
    const id = jobs.start("capture", "x");
    jobs.finish(id, "done");
    expect(get().jobs).toHaveLength(1);
    vi.advanceTimersByTime(FINISHED_JOB_TTL_MS + 1);
    expect(get().jobs).toHaveLength(0);

    for (let i = 0; i < MAX_JOBS + 5; i++) jobs.start("command", `j${i}`);
    expect(get().jobs).toHaveLength(MAX_JOBS);
    expect(get().jobs[0].label).toBe(`j${MAX_JOBS + 4}`);
    jobs.dispose();
    vi.useRealTimers();
  });
});

describe("Heartbeat", () => {
  it("fails immediately on a server answer and stops when asked", async () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    const beat = vi.fn().mockRejectedValue(new ApiError(409, "x", "y"));
    const hb = new Heartbeat(beat, onFailure, 10);
    hb.start(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFailure).toHaveBeenCalledTimes(1);
    hb.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(beat).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("mergeFrameIntoApplied", () => {
  it("returns the same snapshot when the frame brings nothing new", () => {
    const applied = makeSettings();
    const settings = { ...createInitialState("d").settings, applied };
    const channels = Object.entries(applied.channels).map(([n, c]) => ({
      channel: Number(n),
      ...c,
    }));
    expect(
      mergeFrameIntoApplied(
        settings,
        channels,
        applied.timebase,
        applied.trigger,
      ),
    ).toBe(applied);
  });
});

describe("SelectorCache", () => {
  it("returns the previous slice while it is equal", () => {
    const cache = new SelectorCache<{ a: number; b: number }, { a: number }>();
    const select = (s: { a: number; b: number }) => ({ a: s.a });
    const eq = (x: { a: number }, y: { a: number }) => x.a === y.a;
    const first = cache.select({ a: 1, b: 1 }, select, eq);
    expect(cache.select({ a: 1, b: 2 }, select, eq)).toBe(first);
    expect(cache.select({ a: 2, b: 2 }, select, eq)).not.toBe(first);
  });
});
