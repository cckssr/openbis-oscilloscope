import { apiFetch } from "./client";

export interface ProjectOption {
  code: string;
  display_name: string;
  semester?: string;
  group_name?: string;
}

export interface CollectionOption {
  code: string;
  display_name: string;
}

export interface ObjectOption {
  code: string;
  type: string;
  identifier: string;
}

export function listProjects(token: string): Promise<ProjectOption[]> {
  return apiFetch<ProjectOption[]>("/openbis/structure/projects", token);
}

export function listCollections(
  token: string,
  project: string,
): Promise<CollectionOption[]> {
  return apiFetch<CollectionOption[]>(
    `/openbis/structure/collections?project=${encodeURIComponent(project)}`,
    token,
  );
}

export function listObjects(
  token: string,
  collection: string,
): Promise<ObjectOption[]> {
  return apiFetch<ObjectOption[]>(
    `/openbis/structure/objects?collection=${encodeURIComponent(collection)}`,
    token,
  );
}
