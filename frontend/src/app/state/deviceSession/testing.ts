/**
 * Test helpers for the device session store: a fake scope behind the mocked
 * API modules and a fake `BroadcastChannel` hub. Used by `*.test.ts` only —
 * the test file must `vi.mock` the `api/*` modules (automock) first.
 */
import { vi } from "vitest";
import * as devices from "../../../api/devices";
import * as sessions from "../../../api/sessions";
import * as events from "../../../api/events";
import * as config from "../../../api/config";
import type {
  AcquireResponse,
  AcquiredChannel,
  Artifact,
  DeviceDetail,
  DeviceSettings,
  PreviewResponse,
  WaveformData,
} from "../../../api/types";
import type { ChannelFactory, ChannelLike } from "./tabCoordinator";

/** Waveform with `n` samples. */
export function waveform(
  channel: number,
  n = 8,
  artifactId: string | null = null,
): WaveformData {
  return {
    artifact_id: artifactId,
    channel,
    time_s: Array.from({ length: n }, (_, i) => i * 1e-6),
    voltage_V: Array.from({ length: n }, (_, i) => Math.sin(i) * channel),
  };
}

export function makeDevice(
  overrides: Partial<DeviceDetail> = {},
): DeviceDetail {
  return {
    id: "scope-01",
    label: "Scope 01",
    ip: "127.0.0.1",
    port: 5025,
    state: "ONLINE",
    last_error: null,
    lock: null,
    capabilities: [
      "run",
      "stop",
      "acquire",
      "preview",
      "screenshot",
      "single",
      "force_trigger",
      "autoscale",
      "cancel_acquire",
    ],
    channel_count: 4,
    ...overrides,
  };
}

export function makeSettings(): DeviceSettings {
  const channel = (enabled: boolean) => ({
    enabled,
    scale_v_div: 1,
    offset_v: 0,
    coupling: "DC" as const,
    probe_attenuation: 1,
  });
  return {
    channels: {
      1: channel(true),
      2: channel(true),
      3: channel(false),
      4: channel(false),
    },
    timebase: { scale_s_div: 1e-3, offset_s: 0, sample_rate: 1e6 },
    trigger: { source: "CH1", level_v: 0, slope: "RISE", mode: "AUTO" },
  };
}

/** Mutable scope state behind the mocked API. */
export class FakeScope {
  settings = makeSettings();
  device = makeDevice();
  memoryDepth = 12000;
  artifacts: Artifact[] = [];
  nextAcquisition = 1;
  lockCounter = 0;

  channelsOf(): AcquiredChannel[] {
    return Object.entries(this.settings.channels).map(([n, c]) => ({
      channel: Number(n),
      ...c,
    }));
  }
}

/**
 * Installs default behaviour on the automocked API modules.
 * @param scope - The fake scope the mocks read from and write to
 * @returns The scope
 */
export function installFakeApi(scope: FakeScope = new FakeScope()): FakeScope {
  vi.mocked(config.getConfig).mockResolvedValue({
    debug: true,
    version: "test",
    openbis_url: "",
    lab_courses: [],
    lock_ttl_seconds: 300,
    lock_soft_release_seconds: 60,
    eod_reset_time: "23:59",
    eod_timezone: "Europe/Berlin",
  });
  vi.mocked(devices.getDevice).mockImplementation(async () =>
    structuredClone(scope.device),
  );
  vi.mocked(devices.acquireLock).mockImplementation(async (_t, id) => {
    scope.lockCounter += 1;
    return {
      control_session_id: `session-${scope.lockCounter}`,
      device_id: id,
    };
  });
  vi.mocked(devices.releaseLock).mockResolvedValue(undefined);
  vi.mocked(devices.sendHeartbeat).mockResolvedValue(undefined);
  vi.mocked(devices.runDevice).mockResolvedValue(undefined);
  vi.mocked(devices.stopDevice).mockResolvedValue(undefined);
  vi.mocked(devices.sendScopeCommand).mockResolvedValue(undefined);
  vi.mocked(devices.getSettings).mockImplementation(async () =>
    structuredClone(scope.settings),
  );
  vi.mocked(devices.getMemoryDepth).mockImplementation(async (_t, id) => ({
    device_id: id,
    memory_depth: scope.memoryDepth,
  }));
  vi.mocked(devices.setChannelConfig).mockImplementation(
    async (_t, _id, ch, _s, cfg) => {
      scope.settings.channels[ch] = { ...cfg };
    },
  );
  vi.mocked(devices.setTimebase).mockImplementation(
    async (_t, _id, _s, cfg) => {
      scope.settings.timebase = { ...scope.settings.timebase, ...cfg };
    },
  );
  vi.mocked(devices.setTrigger).mockImplementation(async (_t, _id, _s, cfg) => {
    scope.settings.trigger = { ...cfg };
  });
  vi.mocked(devices.previewWaveforms).mockImplementation(
    async (_t, _id, _s, channels): Promise<PreviewResponse> => {
      const enabled = channels ?? [1, 2];
      return {
        channels: scope.channelsOf(),
        waveforms: enabled.map((n) => waveform(n)),
        timebase: scope.settings.timebase,
        trigger: scope.settings.trigger,
      };
    },
  );
  vi.mocked(devices.acquireWaveforms).mockImplementation(
    async (_t, _id, sessionId, options = {}): Promise<AcquireResponse> => {
      const acquisitionId = `acq-${scope.nextAcquisition++}`;
      const enabled = options.channels ?? [1, 2];
      const artifactIds = enabled.map((n) => `${acquisitionId}-ch${n}`);
      enabled.forEach((n, i) =>
        scope.artifacts.push(
          makeArtifact(artifactIds[i], {
            channel: n,
            acquisition_id: acquisitionId,
          }),
        ),
      );
      return {
        artifact_ids: artifactIds,
        acquisition_id: acquisitionId,
        session_id: sessionId,
        created_at: "2026-10-08T10:00:00Z",
        channels: scope.channelsOf(),
        timebase: scope.settings.timebase,
        trigger: scope.settings.trigger,
        waveforms: options.includeData
          ? enabled.map((n, i) =>
              waveform(n, options.maxSamples ? 64 : 8, artifactIds[i]),
            )
          : undefined,
      };
    },
  );
  vi.mocked(devices.cancelAcquire).mockResolvedValue({ cancelled: true });
  vi.mocked(devices.saveScreenshot).mockImplementation(async () => {
    const id = `shot-${scope.artifacts.length + 1}`;
    scope.artifacts.push(
      makeArtifact(id, { artifact_type: "screenshot", channel: null }),
    );
    return { artifact_id: id };
  });
  vi.mocked(devices.softReleaseLockOnUnload).mockReturnValue(undefined);
  vi.mocked(sessions.listArtifacts).mockImplementation(async () =>
    structuredClone(scope.artifacts),
  );
  vi.mocked(sessions.getArtifactWaveform).mockImplementation(
    async (_t, _s, artifactId) => {
      const a = scope.artifacts.find((x) => x.artifact_id === artifactId);
      return waveform(a?.channel ?? 1, 16, artifactId);
    },
  );
  vi.mocked(sessions.setAnnotation).mockResolvedValue(undefined);
  vi.mocked(sessions.flagArtifact).mockResolvedValue(undefined);
  vi.mocked(events.subscribeDeviceEvents).mockReturnValue(() => undefined);
  return scope;
}

export function makeArtifact(
  id: string,
  overrides: Partial<Artifact> = {},
): Artifact {
  return {
    artifact_id: id,
    artifact_type: "trace",
    channel: 1,
    seq: 1,
    persist: false,
    created_at: "2026-10-08T10:00:00Z",
    files: [],
    acquisition_id: null,
    annotation: null,
    run_id: null,
    uploaded: false,
    uploaded_at: null,
    perm_id: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// BroadcastChannel
// ---------------------------------------------------------------------------

class FakeChannel implements ChannelLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(
    private readonly hub: FakeChannelHub,
    private readonly name: string,
  ) {}
  postMessage(data: unknown): void {
    for (const other of this.hub.members(this.name)) {
      if (other === this) continue;
      queueMicrotask(() => other.onmessage?.({ data } as MessageEvent));
    }
  }
  close(): void {
    this.hub.remove(this.name, this);
  }
}

/** In-memory replacement for `BroadcastChannel`, shared by several stores. */
export class FakeChannelHub {
  private readonly channels = new Map<string, Set<FakeChannel>>();
  readonly factory: ChannelFactory = (name) => {
    const channel = new FakeChannel(this, name);
    if (!this.channels.has(name)) this.channels.set(name, new Set());
    this.channels.get(name)!.add(channel);
    return channel;
  };
  members(name: string): FakeChannel[] {
    return [...(this.channels.get(name) ?? [])];
  }
  remove(name: string, channel: FakeChannel): void {
    this.channels.get(name)?.delete(channel);
  }
}

/** Channel factory for single-tab tests. */
export const noChannel: ChannelFactory = () => null;
