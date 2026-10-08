import { apiBaseUrl } from "./client";
import { parseDeviceEvent } from "./schemas";
import type { DeviceEvent } from "./types";

/**
 * Subscribes to the device/lock/progress SSE stream (`GET /devices/events`).
 *
 * `EventSource` cannot send an Authorization header, so the stream is read via
 * `fetch` and parsed manually. The connection is re-opened with a backoff
 * after network errors until the returned function is called.
 *
 * @param token - The authentication bearer token
 * @param onEvent - Called for every valid event (unknown or malformed events are ignored)
 * @param onConnectionChange - Optional; called with true/false when the stream opens or drops
 * @returns A function that closes the stream
 */
export function subscribeDeviceEvents(
  token: string,
  onEvent: (event: DeviceEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const controller = new AbortController();
  let retryMs = 1000;

  const connect = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      try {
        const res = await fetch(`${apiBaseUrl}api/devices/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
        onConnectionChange?.(true);
        retryMs = 1000;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const data = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
            if (!data) continue; // keepalive comment
            let parsed: unknown;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue; // not JSON: ignore
            }
            // Unknown event types and malformed payloads are dropped here.
            const event = parseDeviceEvent(parsed);
            if (event) onEvent(event);
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      onConnectionChange?.(false);
      await new Promise((r) => setTimeout(r, retryMs));
      retryMs = Math.min(retryMs * 2, 15_000);
    }
  };

  void connect();
  return () => controller.abort();
}
