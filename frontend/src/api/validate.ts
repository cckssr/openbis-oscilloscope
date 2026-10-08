/**
 * Runtime validation helpers for the API client ("validate at the edge").
 *
 * Rules (UX review §5.2): unknown fields are ignored, malformed list elements
 * are logged and skipped, a malformed top-level response throws an
 * {@link ApiError} with code `invalid_response`. Nothing malformed ever
 * reaches a component.
 */
import { z } from "zod";
import { ApiError } from "./client";

/** Error code of the {@link ApiError} thrown for a malformed server response. */
export const INVALID_RESPONSE = "invalid_response";

/** German user-facing message for a malformed server response. */
export const INVALID_RESPONSE_MESSAGE = "Unerwartete Antwort vom Server";

/**
 * Compact one-line description of a zod error. Deliberately never includes the
 * offending input, which may be a multi-million sample waveform.
 * @param error - The zod error
 * @returns e.g. `"state: Invalid option; lock.is_mine: expected boolean"`
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * Validates one top-level response body.
 * @param schema - Schema describing the expected shape
 * @param raw - The decoded JSON body
 * @param label - Request label for diagnostics, e.g. `"GET /devices/scope-01"`
 * @returns The parsed value (unknown fields stripped, defaults applied)
 * @throws ApiError with code `invalid_response` when `raw` does not match
 */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  label: string,
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  console.warn(`[api] Invalid response from ${label}: ${describeIssues(result.error)}`);
  // 502: the server answered 2xx, but with something this client cannot use.
  throw new ApiError(502, INVALID_RESPONSE, INVALID_RESPONSE_MESSAGE);
}

/**
 * Validates the elements of an array one by one, logging and skipping the
 * malformed ones.
 * @param schema - Schema of one element
 * @param items - Candidate elements
 * @param label - Diagnostic label of the list, e.g. `"GET /devices"`
 * @returns The valid elements, in order
 */
export function filterValid<T>(
  schema: z.ZodType<T>,
  items: readonly unknown[],
  label: string,
): T[] {
  const out: T[] = [];
  items.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) out.push(result.data);
    else console.warn(`[api] Skipped invalid ${label}[${index}]: ${describeIssues(result.error)}`);
  });
  return out;
}

/**
 * Validates a top-level list response element-wise.
 * @param schema - Schema of one element
 * @param raw - The decoded JSON body (must be an array)
 * @param label - Request label for diagnostics
 * @returns The valid elements; malformed ones are logged and skipped
 * @throws ApiError with code `invalid_response` when `raw` is not an array
 */
export function parseList<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  label: string,
): T[] {
  if (!Array.isArray(raw)) {
    console.warn(`[api] Invalid response from ${label}: expected a list`);
    throw new ApiError(502, INVALID_RESPONSE, INVALID_RESPONSE_MESSAGE);
  }
  return filterValid(schema, raw, label);
}

/**
 * Schema for a nested array whose malformed elements are logged and dropped
 * instead of failing the whole parent object.
 * @param element - Schema of one element
 * @param label - Diagnostic label, e.g. `"preview.waveforms"`
 * @returns A schema producing only the valid elements
 */
export function lenientArray<T>(element: z.ZodType<T>, label: string) {
  return z.array(z.unknown()).transform((items) => filterValid(element, items, label));
}

/**
 * Schema for a numeric sample array (waveform time/voltage). Waveforms can
 * hold millions of points, so the elements are NOT validated one by one: only
 * `Array.isArray` plus the first and last element are checked.
 * @param label - Field name for the error message
 * @returns A schema that returns the input array unchanged (no copy)
 */
export function sampleArray(label: string) {
  return z.custom<number[]>(
    (v) => {
      if (!Array.isArray(v)) return false;
      if (v.length === 0) return true;
      return typeof v[0] === "number" && typeof v[v.length - 1] === "number";
    },
    { error: `${label}: expected an array of numbers` },
  );
}
