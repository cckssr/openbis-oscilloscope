import { apiFetch } from "./client";
import type { Artifact, CommitResponse } from "./types";

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
