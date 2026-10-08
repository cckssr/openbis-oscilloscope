import { apiFetch } from "./client";
import { UserInfoSchema } from "./schemas";
import type { UserInfo } from "./types";
import { parseOrThrow } from "./validate";

/**
 * Validates the token and returns the authenticated user (`GET /auth/me`).
 * @param token - The authentication bearer token
 * @returns A promise resolving to the user profile
 * @throws ApiError 401 for a rejected token, `invalid_response` for a malformed body
 */
export function getMe(token: string): Promise<UserInfo> {
  return apiFetch<unknown>("/auth/me", token).then((raw) =>
    parseOrThrow(UserInfoSchema, raw, "GET /auth/me"),
  );
}
