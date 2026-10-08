import type { DeviceDetail } from "../../../../api/types";
import {
  useDeviceSessionSelector,
  type LockStatus,
} from "../../../state/deviceSession";

/** The slice of the session the header needs. */
export interface HeaderModel {
  device: DeviceDetail | null;
  lockStatus: LockStatus;
  /** When control was taken (ms), if held. */
  since?: number;
  /** Session whose archive "Messdaten" links to: the current one, else the last released one. */
  archiveSessionId?: string;
  total: number;
  notUploaded: number;
  busy: string | null;
}

const shallowEqual = (a: HeaderModel, b: HeaderModel) =>
  (Object.keys(a) as (keyof HeaderModel)[]).every((k) => Object.is(a[k], b[k]));

const select = (
  s: Parameters<Parameters<typeof useDeviceSessionSelector>[1]>[0],
): HeaderModel => ({
  device: s.device,
  lockStatus: s.lock.status,
  since: s.lock.since,
  archiveSessionId: s.lock.sessionId ?? s.lock.previousSessionId,
  total: s.counts.total,
  notUploaded: s.counts.notUploaded,
  busy: s.busy,
});

/**
 * Header slice of a device session.
 * @param deviceId - The device
 * @returns Lock, counts and device info for the header
 */
export function useHeaderModel(deviceId: string): HeaderModel {
  return useDeviceSessionSelector(deviceId, select, shallowEqual);
}

/**
 * Where "Messdaten" and the upload step lead: the session's archive, or the
 * session list when there is no session yet.
 * @param sessionId - Current or last released session
 * @returns A router path
 */
export function archivePath(sessionId: string | undefined): string {
  return sessionId ? `/archive/${sessionId}` : "/sessions";
}
