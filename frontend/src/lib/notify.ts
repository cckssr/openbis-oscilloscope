import { toast } from "sonner";
import { ApiError } from "../api/client";

/**
 * Extracts a user-facing message from an unknown error.
 * @param err - Anything thrown (ApiError, Error, string …)
 * @param fallback - German message used when the error carries none
 * @returns The message to show
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Shows an error toast. Use for every failed user action — never only console.error.
 * @param err - The caught error
 * @param fallback - German message used when the error carries none
 * @param title - Optional headline, e.g. "Markierung fehlgeschlagen"
 */
export function notifyError(err: unknown, fallback: string, title?: string): void {
  const message = errorMessage(err, fallback);
  if (title) toast.error(title, { description: message });
  else toast.error(message);
}

/**
 * Shows a success toast.
 * @param title - Headline, e.g. "Aufnahme #5 gespeichert"
 * @param description - Optional detail line
 */
export function notifySuccess(title: string, description?: string): void {
  toast.success(title, description ? { description } : undefined);
}
