import { apiFetch } from "./client";
import type { Artifact, CommitResponse, WaveformData } from "./types";

export function listArtifacts(
  token: string,
  sessionId: string,
): Promise<Artifact[]> {
  return apiFetch<Artifact[]>(`/sessions/${sessionId}/artifacts`, token);
}

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

export function getArtifactWaveform(
  token: string,
  sessionId: string,
  artifactId: string,
): Promise<WaveformData> {
  return apiFetch<WaveformData>(
    `/sessions/${sessionId}/artifacts/${artifactId}/data`,
    token,
  );
}

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

export function commitSession(
  token: string,
  sessionId: string,
  experimentId: string,
  sampleId?: string,
): Promise<CommitResponse> {
  const params = new URLSearchParams({ experiment_id: experimentId });
  if (sampleId) params.set("sample_id", sampleId);
  return apiFetch<CommitResponse>(
    `/sessions/${sessionId}/commit?${params.toString()}`,
    token,
    { method: "POST" },
  );
}
