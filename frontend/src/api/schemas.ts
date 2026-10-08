/**
 * zod schemas for every backend response the client consumes.
 *
 * Each schema's output type is checked at compile time against the
 * hand-written interface in `types.ts` (see {@link SchemaChecks}), so the two
 * cannot drift apart. Objects are non-strict: unknown fields are stripped.
 * Legacy responses get defaults; malformed nested list entries are dropped.
 */
import { z } from "zod";
import type {
  AcquireResponse,
  AcquiredChannel,
  AppConfig,
  Artifact,
  Capability,
  ChannelConfig,
  CommitResponse,
  Device,
  DeviceDetail,
  DeviceEvent,
  DeviceSettings,
  LockInfo,
  LockResponse,
  MemoryDepthResponse,
  PreviewResponse,
  SessionSummary,
  TimebaseConfig,
  TriggerConfig,
  UserInfo,
  WaveformData,
} from "./types";
import type {
  CollectionOption,
  ObjectOption,
  ProjectOption,
} from "./openbis_structure";
import { describeIssues, lenientArray, sampleArray } from "./validate";

// ---------------------------------------------------------------------------
// Auth / config
// ---------------------------------------------------------------------------

export const UserInfoSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  is_admin: z.boolean(),
});

const LabCourseSchema = z.object({ value: z.string(), label: z.string() });

/** Missing fields fall back to defaults so an older backend still boots the UI. */
export const AppConfigSchema = z.object({
  debug: z.boolean().default(false),
  version: z.string().default("dev"),
  openbis_url: z
    .string()
    .nullable()
    .transform((v) => v ?? "")
    .default(""),
  lab_courses: lenientArray(LabCourseSchema, "config.lab_courses").default([]),
  lock_ttl_seconds: z.number().default(300),
  lock_soft_release_seconds: z.number().default(60),
  eod_reset_time: z.string().default("23:59"),
  eod_timezone: z.string().default("Europe/Berlin"),
});

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export const DeviceStateSchema = z.enum([
  "OFFLINE",
  "ONLINE",
  "LOCKED",
  "BUSY",
  "ERROR",
]);

export const LockInfoSchema = z.object({
  owner_user: z.string(),
  acquired_at: z.number(),
  is_mine: z.boolean(),
  session_id: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
});

export const DeviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  ip: z.string(),
  port: z.number(),
  state: DeviceStateSchema,
  last_error: z.string().nullable().default(null),
  lock: LockInfoSchema.nullable().default(null),
});

/** Every capability this UI knows how to render; anything else is dropped. */
export const KNOWN_CAPABILITIES = [
  "run",
  "stop",
  "acquire",
  "preview",
  "screenshot",
  "single",
  "force_trigger",
  "autoscale",
  "cancel_acquire",
] as const satisfies readonly Capability[];

const knownCapabilities: ReadonlySet<unknown> = new Set(KNOWN_CAPABILITIES);

/** Keeps the known capability names (new backend capabilities are ignored). */
export const CapabilitiesSchema = z
  .array(z.unknown())
  .transform((items) =>
    items.filter((c): c is Capability => knownCapabilities.has(c)),
  );

export const DeviceDetailSchema = DeviceSchema.extend({
  capabilities: CapabilitiesSchema.default([]),
  channel_count: z.number().int().positive().default(4),
});

export const LockResponseSchema = z.object({
  control_session_id: z.string(),
  device_id: z.string(),
});

export const CancelAcquireResponseSchema = z.object({ cancelled: z.boolean() });
export const SaveScreenshotResponseSchema = z.object({
  artifact_id: z.string(),
});
export const KeyboardLockResponseSchema = z.object({
  device_id: z.string(),
  keyboard_locked: z.boolean(),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const CouplingSchema = z.enum(["DC", "AC", "GND"]);

export const ChannelConfigSchema = z.object({
  enabled: z.boolean(),
  scale_v_div: z.number(),
  offset_v: z.number(),
  coupling: CouplingSchema,
  probe_attenuation: z.number(),
});

export const TimebaseConfigSchema = z.object({
  scale_s_div: z.number(),
  offset_s: z.number(),
  sample_rate: z.number(),
});

export const TriggerConfigSchema = z.object({
  source: z.string(),
  level_v: z.number(),
  slope: z.enum(["RISE", "FALL", "EITHER"]),
  mode: z.enum(["AUTO", "NORMAL", "SINGLE"]),
});

/**
 * Channels arrive as a JSON object keyed by channel number. A malformed entry
 * (or a non-numeric key) is logged and dropped; the rest of the settings stay usable.
 */
const ChannelMapSchema = z
  .record(z.string(), z.unknown())
  .transform((entries) => {
    const out: Record<number, ChannelConfig> = {};
    for (const [key, value] of Object.entries(entries)) {
      const channel = Number(key);
      const parsed = ChannelConfigSchema.safeParse(value);
      if (!Number.isInteger(channel) || channel < 1) {
        console.warn(
          `[api] Skipped settings.channels["${key}"]: not a channel number`,
        );
      } else if (!parsed.success) {
        console.warn(
          `[api] Skipped settings.channels[${key}]: ${describeIssues(parsed.error)}`,
        );
      } else {
        out[channel] = parsed.data;
      }
    }
    return out;
  });

export const DeviceSettingsSchema = z.object({
  channels: ChannelMapSchema,
  timebase: TimebaseConfigSchema,
  trigger: TriggerConfigSchema,
});

export const MemoryDepthResponseSchema = z.object({
  device_id: z.string(),
  memory_depth: z.number(),
});

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

export const AcquiredChannelSchema = ChannelConfigSchema.extend({
  channel: z.number(),
});

/**
 * Sample arrays are only spot-checked (first/last element) — see
 * {@link sampleArray}. Both arrays must have the same length.
 */
export const WaveformDataSchema = z
  .object({
    artifact_id: z.string().nullable().default(null),
    channel: z.number(),
    time_s: sampleArray("time_s"),
    voltage_V: sampleArray("voltage_V"),
  })
  .refine((w) => w.time_s.length === w.voltage_V.length, {
    error: "time_s and voltage_V differ in length",
  });

const channelsOf = (label: string) =>
  lenientArray(AcquiredChannelSchema, label);
const waveformsOf = (label: string) => lenientArray(WaveformDataSchema, label);

export const PreviewResponseSchema = z.object({
  channels: channelsOf("preview.channels"),
  waveforms: waveformsOf("preview.waveforms"),
  timebase: TimebaseConfigSchema,
  trigger: TriggerConfigSchema,
});

export const AcquireResponseSchema = z.object({
  artifact_ids: z.array(z.string()),
  acquisition_id: z.string(),
  session_id: z.string(),
  created_at: z.string(),
  channels: channelsOf("acquire.channels"),
  timebase: TimebaseConfigSchema,
  trigger: TriggerConfigSchema,
  waveforms: waveformsOf("acquire.waveforms").optional(),
});

// ---------------------------------------------------------------------------
// Sessions / artifacts
// ---------------------------------------------------------------------------

const nullableString = z.string().nullable().default(null);

/** Legacy index entries lack `uploaded`, `uploaded_at`, `perm_id`, … — defaults apply. */
export const ArtifactSchema = z.object({
  artifact_id: z.string(),
  artifact_type: z.enum(["trace", "screenshot"]),
  channel: z.number().nullable().default(null),
  seq: z.number(),
  persist: z.boolean().default(false),
  created_at: z.string(),
  files: z.array(z.string()).default([]),
  acquisition_id: nullableString,
  annotation: nullableString,
  run_id: nullableString,
  uploaded: z.boolean().default(false),
  uploaded_at: nullableString,
  perm_id: nullableString,
});

export const SessionSummarySchema = z.object({
  session_id: z.string(),
  device_id: z.string(),
  device_label: z.string(),
  owner_user: z.string(),
  created_at: z.string(),
  last_activity: z.string(),
  is_active: z.boolean(),
  counts: z.object({
    acquisitions: z.number().default(0),
    screenshots: z.number().default(0),
    flagged: z.number().default(0),
    uploaded: z.number().default(0),
  }),
});

export const CommitResponseSchema = z.object({
  permId: z.string().nullable().default(null),
  artifact_count: z.number(),
  artifact_ids: z.array(z.string()).default([]),
  openbis_url: z.string().nullable().default(null),
  dropbox_file: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
});

// ---------------------------------------------------------------------------
// openBIS structure
// ---------------------------------------------------------------------------

const optionalString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

export const ProjectOptionSchema = z.object({
  code: z.string(),
  display_name: z.string(),
  semester: optionalString,
  group_name: optionalString,
});

export const CollectionOptionSchema = z.object({
  code: z.string(),
  display_name: z.string(),
  identifier: z.string(),
});

export const ObjectOptionSchema = z.object({
  code: z.string(),
  type: z.string(),
  identifier: z.string(),
});

// ---------------------------------------------------------------------------
// SSE events
// ---------------------------------------------------------------------------

const DeviceStateEventSchema = z.object({
  type: z.literal("device_state"),
  device_id: z.string(),
  state: DeviceStateSchema,
  last_error: z.string().nullable().default(null),
});

const LockEventSchema = z.object({
  type: z.literal("lock"),
  device_id: z.string(),
  owner_user: z.string().nullable().default(null),
  session_id: z.string().nullable().default(null),
});

const ProgressEventSchema = z.object({
  type: z.literal("progress"),
  device_id: z.string(),
  session_id: z.string(),
  job: z.literal("acquire"),
  done: z.number(),
  detail: z.string().default(""),
});

export const DeviceEventSchema = z.discriminatedUnion("type", [
  DeviceStateEventSchema,
  LockEventSchema,
  ProgressEventSchema,
]);

const KNOWN_EVENT_TYPES: ReadonlySet<unknown> = new Set([
  "device_state",
  "lock",
  "progress",
]);

/**
 * Validates one decoded SSE payload.
 * @param raw - The JSON-decoded event
 * @returns The event, or `null` when its type is unknown (silently ignored, for
 *   forward compatibility) or a known event is malformed (ignored with a warning)
 */
export function parseDeviceEvent(raw: unknown): DeviceEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const type = (raw as { type?: unknown }).type;
  if (!KNOWN_EVENT_TYPES.has(type)) return null;
  const result = DeviceEventSchema.safeParse(raw);
  if (result.success) return result.data;
  console.warn(
    `[api] Ignored invalid "${String(type)}" event: ${describeIssues(result.error)}`,
  );
  return null;
}

// ---------------------------------------------------------------------------
// Compile-time check: every schema output must be assignable to the interface
// the rest of the app uses. A mismatch fails `tsc`.
// ---------------------------------------------------------------------------

type Extends<A, B> = [A] extends [B] ? true : false;
type Assert<T extends true> = T;

/** Never used at runtime; exists so `tsc` verifies schema/interface alignment. */
export type SchemaChecks = [
  Assert<Extends<z.output<typeof UserInfoSchema>, UserInfo>>,
  Assert<Extends<z.output<typeof AppConfigSchema>, AppConfig>>,
  Assert<Extends<z.output<typeof LockInfoSchema>, LockInfo>>,
  Assert<Extends<z.output<typeof DeviceSchema>, Device>>,
  Assert<Extends<z.output<typeof DeviceDetailSchema>, DeviceDetail>>,
  Assert<Extends<z.output<typeof LockResponseSchema>, LockResponse>>,
  Assert<Extends<z.output<typeof ChannelConfigSchema>, ChannelConfig>>,
  Assert<Extends<z.output<typeof TimebaseConfigSchema>, TimebaseConfig>>,
  Assert<Extends<z.output<typeof TriggerConfigSchema>, TriggerConfig>>,
  Assert<Extends<z.output<typeof DeviceSettingsSchema>, DeviceSettings>>,
  Assert<
    Extends<z.output<typeof MemoryDepthResponseSchema>, MemoryDepthResponse>
  >,
  Assert<Extends<z.output<typeof AcquiredChannelSchema>, AcquiredChannel>>,
  Assert<Extends<z.output<typeof WaveformDataSchema>, WaveformData>>,
  Assert<Extends<z.output<typeof PreviewResponseSchema>, PreviewResponse>>,
  Assert<Extends<z.output<typeof AcquireResponseSchema>, AcquireResponse>>,
  Assert<Extends<z.output<typeof ArtifactSchema>, Artifact>>,
  Assert<Extends<z.output<typeof SessionSummarySchema>, SessionSummary>>,
  Assert<Extends<z.output<typeof CommitResponseSchema>, CommitResponse>>,
  Assert<Extends<z.output<typeof DeviceEventSchema>, DeviceEvent>>,
  Assert<Extends<z.output<typeof ProjectOptionSchema>, ProjectOption>>,
  Assert<Extends<z.output<typeof CollectionOptionSchema>, CollectionOption>>,
  Assert<Extends<z.output<typeof ObjectOptionSchema>, ObjectOption>>,
  // Every Capability must be listed in KNOWN_CAPABILITIES.
  Assert<Extends<Capability, (typeof KNOWN_CAPABILITIES)[number]>>,
];
