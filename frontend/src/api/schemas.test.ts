import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { getMe } from "./auth";
import {
  getDevice,
  getSettings,
  listDevices,
  previewWaveforms,
} from "./devices";
import { subscribeDeviceEvents } from "./events";
import { listArtifacts, listMySessions } from "./sessions";
import {
  parseDeviceEvent,
  UserInfoSchema,
  WaveformDataSchema,
} from "./schemas";
import { parseList, parseOrThrow } from "./validate";

const goodDevice = {
  id: "scope-01",
  label: "Scope",
  ip: "10.0.0.1",
  port: 5025,
  state: "ONLINE",
  last_error: null,
  lock: null,
};

const goodChannel = {
  enabled: true,
  scale_v_div: 1,
  offset_v: 0,
  coupling: "DC",
  probe_attenuation: 1,
};

/** Makes the next `fetch` answer with JSON. */
function mockJson(body: unknown, init: { status?: number } = {}) {
  const res = new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("unknown fields", () => {
  it("are stripped from objects", async () => {
    mockJson({ user_id: "u", display_name: "U", is_admin: false, extra: 1 });
    const me = await getMe("t");
    expect(me).toEqual({ user_id: "u", display_name: "U", is_admin: false });
    expect(warn).not.toHaveBeenCalled();
  });

  it("are ignored on devices (e.g. uptime_minutes)", async () => {
    mockJson([{ ...goodDevice, uptime_minutes: 4, online_since_utc: "x" }]);
    const [d] = await listDevices("t");
    expect(d).toEqual(goodDevice);
  });
});

describe("capabilities", () => {
  it("drops unknown capability names and keeps known ones", async () => {
    mockJson({
      ...goodDevice,
      capabilities: ["run", "fft", "autoscale", 7],
      channel_count: 2,
    });
    const d = await getDevice("t", "scope-01");
    expect(d.capabilities).toEqual(["run", "autoscale"]);
    expect(d.channel_count).toBe(2);
  });

  it("defaults to no capabilities and 4 channels", async () => {
    mockJson(goodDevice);
    const d = await getDevice("t", "scope-01");
    expect(d.capabilities).toEqual([]);
    expect(d.channel_count).toBe(4);
  });
});

describe("settings", () => {
  const base = {
    timebase: { scale_s_div: 1e-3, offset_s: 0, sample_rate: 1e6 },
    trigger: { source: "CH1", level_v: 0, slope: "RISE", mode: "AUTO" },
  };

  it("keys channels by number and drops a malformed channel entry", async () => {
    mockJson({
      ...base,
      channels: {
        "1": goodChannel,
        "2": { ...goodChannel, coupling: "XX" },
        x: goodChannel,
      },
    });
    const s = await getSettings("t", "scope-01");
    expect(Object.keys(s.channels)).toEqual(["1"]);
    expect(s.channels[1]).toEqual(goodChannel);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("throws invalid_response when the timebase is malformed", async () => {
    mockJson({ ...base, timebase: { scale_s_div: "fast" }, channels: {} });
    const err = await getSettings("t", "scope-01").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("invalid_response");
    expect((err as ApiError).message).toBe("Unerwartete Antwort vom Server");
  });
});

describe("lists", () => {
  it("skip malformed elements with a warning and return the rest", async () => {
    mockJson([goodDevice, { id: "broken" }, { ...goodDevice, id: "scope-02" }]);
    const devices = await listDevices("t");
    expect(devices.map((d) => d.id)).toEqual(["scope-01", "scope-02"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("GET /devices[1]");
  });

  it("throw invalid_response when the body is not an array", async () => {
    mockJson({ devices: [] });
    await expect(listDevices("t")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("skip malformed sessions", async () => {
    mockJson([{ session_id: "s" }]);
    expect(await listMySessions("t")).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("artifacts", () => {
  it("get defaults for legacy entries without upload fields", async () => {
    mockJson([
      {
        artifact_id: "trace_0001_ch1",
        artifact_type: "trace",
        channel: 1,
        seq: 1,
        persist: true,
        created_at: "2026-01-01T00:00:00Z",
        files: ["a.csv"],
      },
    ]);
    const [a] = await listArtifacts("t", "s");
    expect(a).toMatchObject({
      uploaded: false,
      uploaded_at: null,
      perm_id: null,
      acquisition_id: null,
      annotation: null,
      run_id: null,
      persist: true,
    });
  });
});

describe("config", () => {
  it("fills defaults for fields an older backend does not send", async () => {
    mockJson({
      debug: true,
      version: "0.3.0",
      lab_courses: [{ value: "GP1", label: "GP1" }, 5],
    });
    vi.resetModules();
    const { getConfig: fresh } = await import("./config");
    const cfg = await fresh();
    expect(cfg.lab_courses).toEqual([{ value: "GP1", label: "GP1" }]);
    expect(cfg.lock_soft_release_seconds).toBe(60);
    expect(cfg.openbis_url).toBe("");
  });
});

describe("waveform sample arrays", () => {
  /** Array that throws when anything but length/first/last is read. */
  function guardedArray(length: number): number[] {
    const target = new Array<number>(length);
    target[0] = 1;
    target[length - 1] = 2;
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (
          prop === Symbol.iterator ||
          prop === "map" ||
          prop === "every" ||
          prop === "forEach"
        ) {
          throw new Error(`array was iterated via ${String(prop)}`);
        }
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          const i = Number(prop);
          if (i !== 0 && i !== length - 1)
            throw new Error(`element ${i} was read`);
        }
        return Reflect.get(t, prop, receiver);
      },
    });
  }

  it("are not iterated element by element and are returned by reference", () => {
    const time_s = guardedArray(5_000_000);
    const voltage_V = guardedArray(5_000_000);
    const parsed = WaveformDataSchema.parse({
      artifact_id: null,
      channel: 1,
      time_s,
      voltage_V,
    });
    expect(parsed.time_s).toBe(time_s);
  });

  it("validates millions of samples quickly", () => {
    const n = 3_000_000;
    const time_s = new Array<number>(n).fill(0);
    const voltage_V = new Array<number>(n).fill(0);
    const t0 = performance.now();
    WaveformDataSchema.parse({
      artifact_id: "a",
      channel: 2,
      time_s,
      voltage_V,
    });
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("reject non-arrays, non-numeric ends and mismatching lengths", () => {
    const ok = {
      artifact_id: null,
      channel: 1,
      time_s: [0, 1],
      voltage_V: [0, 1],
    };
    expect(WaveformDataSchema.safeParse(ok).success).toBe(true);
    expect(WaveformDataSchema.safeParse({ ...ok, time_s: "abc" }).success).toBe(
      false,
    );
    expect(
      WaveformDataSchema.safeParse({ ...ok, voltage_V: [0, null] }).success,
    ).toBe(false);
    expect(
      WaveformDataSchema.safeParse({ ...ok, voltage_V: [0] }).success,
    ).toBe(false);
  });

  it("drop a malformed waveform from a preview but keep the others", async () => {
    mockJson({
      channels: [{ ...goodChannel, channel: 1 }],
      waveforms: [
        { artifact_id: null, channel: 1, time_s: [0, 1], voltage_V: [0, 1] },
        { artifact_id: null, channel: 2, time_s: "no", voltage_V: [] },
      ],
      timebase: { scale_s_div: 1, offset_s: 0, sample_rate: 1 },
      trigger: { source: "CH1", level_v: 0, slope: "RISE", mode: "AUTO" },
    });
    const p = await previewWaveforms("t", "scope-01", "s");
    expect(p.waveforms).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("top-level validation", () => {
  it("parseOrThrow throws ApiError invalid_response", () => {
    expect.assertions(3);
    try {
      parseOrThrow(UserInfoSchema, { user_id: 1 }, "GET /auth/me");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("invalid_response");
      expect((e as ApiError).message).toBe("Unerwartete Antwort vom Server");
    }
  });

  it("getMe rejects a malformed body", async () => {
    mockJson({ nope: true });
    await expect(getMe("t")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("parseList rejects null", () => {
    expect(() => parseList(UserInfoSchema, null, "x")).toThrow(ApiError);
  });

  it("HTTP errors still surface as the backend's ApiError", async () => {
    mockJson(
      { error: "unauthorized", detail: "Token ungültig" },
      { status: 401 },
    );
    await expect(getMe("t")).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });
});

describe("SSE events", () => {
  it("returns known valid events", () => {
    expect(
      parseDeviceEvent({
        type: "device_state",
        device_id: "d",
        state: "ONLINE",
        last_error: null,
        x: 1,
      }),
    ).toEqual({
      type: "device_state",
      device_id: "d",
      state: "ONLINE",
      last_error: null,
    });
    expect(
      parseDeviceEvent({
        type: "lock",
        device_id: "d",
        owner_user: null,
        session_id: null,
      }),
    ).toMatchObject({ type: "lock" });
    expect(
      parseDeviceEvent({
        type: "progress",
        device_id: "d",
        session_id: "s",
        job: "acquire",
        done: 0.5,
        detail: "CH1",
      }),
    ).toMatchObject({ done: 0.5 });
  });

  it("ignores unknown event types silently", () => {
    expect(
      parseDeviceEvent({ type: "firmware_update", device_id: "d" }),
    ).toBeNull();
    expect(parseDeviceEvent("garbage")).toBeNull();
    expect(parseDeviceEvent(null)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("subscribeDeviceEvents delivers only valid known events", async () => {
    const frames = [
      'data: {"type":"firmware_update","device_id":"d"}\n\n',
      ": keepalive\n\n",
      "data: not json\n\n",
      'data: {"type":"lock","device_id":"d","owner_user":"u","session_id":"s"}\n\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        frames.forEach((f) => controller.enqueue(enc.encode(f)));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );
    const onEvent = vi.fn();
    const stop = subscribeDeviceEvents("t", onEvent);
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    stop();
    expect(onEvent.mock.calls[0][0]).toMatchObject({
      type: "lock",
      owner_user: "u",
    });
  });

  it("ignores malformed known events with a warning", () => {
    expect(
      parseDeviceEvent({
        type: "device_state",
        device_id: "d",
        state: "EXPLODED",
      }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
