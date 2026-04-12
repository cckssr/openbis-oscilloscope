import { apiFetch } from "./client";
import type { UserInfo } from "./types";

export function getMe(token: string): Promise<UserInfo> {
  return apiFetch<UserInfo>("/auth/me", token);
}
