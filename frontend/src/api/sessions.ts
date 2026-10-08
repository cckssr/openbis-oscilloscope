import { apiFetch } from "./client";
import {
  ArtifactSchema,
  CommitResponseSchema,
  SessionSummarySchema,
  WaveformDataSchema,
} from "./schemas";
import { parseList, parseOrThrow } from "./validate";
import type {
  Artifact,
  CommitResponse,
  SessionSummary,
  WaveformData,
} from "./types";

/**
 * Lists the control sessions of the current user, newest first ("Meine Messdaten").
 * @param token - The authentication bearer token
 * @returns A promise resolving to one summary per session still on disk
 */
export function listMySessions(token: string): Promise<SessionSummary[]> {
  return apiFetch<unknown>("/sessions?mine=true", token).then((raw) =>
    parseList(SessionSummarySchema, raw, "GET /sessions"),
  );
}

/**
 * Lists every artifact stored in a session.
 * @param token - The authentication bearer token
 * @param sessionId - The control session UUID
 * @returns A promise resolving to the artifacts in storage order
 */
export function listArtifacts(
  token: string,
  sessionId: string,
): Promise<Artifact[]> {
  return apiFetch<unknown>(`/sessions/${sessionId}/artifacts`, token).then((raw) =>
    parseList(ArtifactSchema, raw, "GET /sessions/{id}/artifacts"),
  );
}

/**
 * Marks or unmarks an artifact for the next upload.
 * @param token - The authentication bearer token
 * @param sessionId - The control session UUID
 * @param artifactId - The artifact to update
 * @param persist - true to select it for upload
 * @returns A promise that resolves when the flag is stored
 */
export function flagArtifact(
  token: string,
  sessionId: string,
  artifactId: string,
  persist: boolean,
): Promise<void> {
  return apiFetch<void>(
    `/sessions/${sessionId}/artifacts/${artifactId}/flag?persist=${persist}`,
    token,
    { method: "POST" },
  );
}

/**
 * Stores a free-text note on every channel trace of one capture.
 * @param token - The authentication bearer token
 * @param sessionId - The control session UUID
 * @param acquisitionId - The capture ("Aufnahme") identifier
 * @param annotation - The note text
 * @returns A promise that resolves when the note is stored
 */
export function setAnnotation(
  token: string,
  sessionId: string,
  acquisitionId: string,
  annotation: string,
): Promise<void> {
  return apiFetch<void>(
    `/sessions/${sessionId}/acquisitions/${acquisitionId}/annotation`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation }),
    },
  );
}

/**
 * Loads the full-resolution samples of one stored trace.
 * @param token - The authentication bearer token
 * @param sessionId - The control session UUID
 * @param artifactId - The trace artifact
 * @returns A promise resolving to the time and voltage arrays
 */
export function getArtifactWaveform(
  token: string,
  sessionId: string,
  artifactId: string,
): Promise<WaveformData> {
  return apiFetch<unknown>(
    `/sessions/${sessionId}/artifacts/${artifactId}/data`,
    token,
  ).then((raw) =>
    parseOrThrow(WaveformDataSchema, raw, "GET /sessions/{id}/artifacts/{id}/data"),
  );
}

/**
 * Loads a stored screenshot as PNG.
 * @param token - The authentication bearer token
 * @param sessionId - The control session UUID
 * @param artifactId - The screenshot artifact
 * @returns A promise resolving to the PNG blob
 */
export function fetchArtifactScreenshot(
  token: string,
  sessionId: string,
  artifactId: string,
): Promise<Blob> {
  return apiFetch<Blob>(
    `/sessions/${sessionId}/artifacts/${artifactId}/image`,
    token,
  );
}

/**
 * Builds a ZIP of the given artifacts on the server (all artifacts when empty).
 * @param token - The authentication bearer token
 * @param sessionId - The control session UUID
 * @param artifactIds - Artifacts to include; empty means the whole session
 * @returns A promise resolving to the ZIP blob
 */
export function downloadArtifactsZip(
  token: string,
  sessionId: string,
  artifactIds: string[] = [],
): Promise<Blob> {
  const params = new URLSearchParams();
  artifactIds.forEach((id) => params.append("artifact_ids", id));
  return apiFetch<Blob>(`/sessions/${sessionId}/download?${params}`, token);
}

/**
 * Exports the given trace artifacts as one HDF5 file built on the server.
 * @param token - The authentication bearer token
 * @param sessionId - The control session UUID
 * @param artifactIds - Trace artifacts to include
 * @returns A promise resolving to the `.h5` blob
 */
export function exportArtifactsHdf5(
  token: string,
  sessionId: string,
  artifactIds: string[],
): Promise<Blob> {
  const params = new URLSearchParams();
  artifactIds.forEach((id) => params.append("artifact_ids", id));
  return apiFetch<Blob>(`/sessions/${sessionId}/export.h5?${params}`, token);
}

export interface CommitRequest {
  experiment_id: string;
  object_id?: string;
  /** Upload exactly these artifacts; when omitted all flagged artifacts are used. */
  artifact_ids?: string[];
  lab_course?: string;
  exp_title?: string;
  group_name?: string;
  semester?: string;
  exp_description?: string;
  device_under_test?: string;
  measurement_purpose?: string;
  keywords?: string;
  data_quality?: string;
  external_parameters?: string;
  notes?: string;
}

/**
 * Uploads artifacts to openBIS as one dataset. On success the backend marks
 * them as uploaded and clears their upload selection.
 * @param token - The authentication bearer token
 * @param sessionId - The control session UUID
 * @param body - Upload target, artifact selection and dataset metadata
 * @returns A promise resolving to the permId and ELN link
 */
export function commitSession(
  token: string,
  sessionId: string,
  body: CommitRequest,
): Promise<CommitResponse> {
  return apiFetch<unknown>(`/sessions/${sessionId}/commit`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((raw) => parseOrThrow(CommitResponseSchema, raw, "POST /sessions/{id}/commit"));
}
