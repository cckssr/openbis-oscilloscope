import { apiFetch } from "./client";
import {
  CollectionOptionSchema,
  ObjectOptionSchema,
  ProjectOptionSchema,
} from "./schemas";
import { parseList } from "./validate";

export interface ProjectOption {
  code: string;
  display_name: string;
  semester?: string;
  group_name?: string;
}

export interface CollectionOption {
  code: string;
  display_name: string;
  identifier: string;
}

export interface ObjectOption {
  code: string;
  type: string;
  identifier: string;
}

/**
 * Lists the openBIS projects (lab groups) the user may upload to.
 * @param token - The authentication bearer token
 * @returns A promise resolving to the valid project options
 */
export function listProjects(token: string): Promise<ProjectOption[]> {
  return apiFetch<unknown>("/openbis/structure/projects", token).then((raw) =>
    parseList(ProjectOptionSchema, raw, "GET /openbis/structure/projects"),
  );
}

/**
 * Lists the collections of a project.
 * @param token - The authentication bearer token
 * @param project - The project code
 * @returns A promise resolving to the valid collection options
 */
export function listCollections(
  token: string,
  project: string,
): Promise<CollectionOption[]> {
  return apiFetch<unknown>(
    `/openbis/structure/collections?project=${encodeURIComponent(project)}`,
    token,
  ).then((raw) =>
    parseList(
      CollectionOptionSchema,
      raw,
      "GET /openbis/structure/collections",
    ),
  );
}

/**
 * Lists the objects of a collection.
 * @param token - The authentication bearer token
 * @param collection - The collection identifier
 * @returns A promise resolving to the valid object options
 */
export function listObjects(
  token: string,
  collection: string,
): Promise<ObjectOption[]> {
  return apiFetch<unknown>(
    `/openbis/structure/objects?collection=${encodeURIComponent(collection)}`,
    token,
  ).then((raw) =>
    parseList(ObjectOptionSchema, raw, "GET /openbis/structure/objects"),
  );
}
