/**
 * Lock heartbeat. Runs only in the tab that controls the device. A server
 * answer (ApiError) is final; a plain network error is retried once shortly
 * after, so a Wi-Fi blip does not cost the student the lock.
 */
import { ApiError } from "../../../api/client";

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private inFlight = false;

  /**
   * @param beat - Sends one heartbeat request
   * @param onFailure - Called when the lock must be considered lost
   * @param retryDelayMs - Delay of the single retry after a network error
   */
  constructor(
    private readonly beat: () => Promise<void>,
    private readonly onFailure: (err: unknown) => void,
    private readonly retryDelayMs = 3000,
  ) {}

  /** True while the interval runs. */
  get running(): boolean {
    return this.timer !== null;
  }

  /**
   * Starts (or restarts) the interval.
   * @param intervalMs - Time between heartbeats
   */
  start(intervalMs: number): void {
    this.stop();
    const generation = this.generation;
    this.timer = setInterval(
      () => void this.tick(generation, false),
      intervalMs,
    );
  }

  /** Sends one heartbeat right now (e.g. after the page came back from the bfcache). */
  pulse(): void {
    if (this.timer) void this.tick(this.generation, false);
  }

  /** Stops the interval and ignores in-flight results. */
  stop(): void {
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
    this.inFlight = false;
  }

  private async tick(generation: number, isRetry: boolean): Promise<void> {
    if (this.inFlight && !isRetry) return;
    this.inFlight = true;
    try {
      await this.beat();
      if (generation === this.generation) this.inFlight = false;
    } catch (err) {
      if (generation !== this.generation) return;
      this.inFlight = false;
      if (err instanceof ApiError || isRetry) {
        this.onFailure(err);
        return;
      }
      this.retryTimer = setTimeout(
        () => void this.tick(generation, true),
        this.retryDelayMs,
      );
    }
  }
}
