/**
 * Sequential preview loop (review A5). The next request starts only after the
 * previous one finished (min period {@link MIN_FRAME_PERIOD_MS}); it yields to
 * queued user commands and gives up after {@link MAX_FAILURES} failures in a
 * row. The loop stores nothing — it only hands frames to `onFrame`.
 */
import type { PreviewResponse } from "../../../api/types";
import { cancellableSleep, type CancellableSleep } from "./context";

export const MIN_FRAME_PERIOD_MS = 500;
export const MAX_FAILURES = 3;

export interface LiveLoopDeps {
  /** Reads one frame (the channels to request are decided by the caller). */
  fetchFrame(): Promise<PreviewResponse>;
  /** Resolves when no user command is queued or running. */
  yieldToCommands(): Promise<void>;
  /** Called for each frame of the current run. */
  onFrame(frame: PreviewResponse): void;
  /** Called once after {@link MAX_FAILURES} consecutive failures; the loop has ended. */
  onGiveUp(err: unknown): void;
  minPeriodMs?: number;
  maxFailures?: number;
  now(): number;
}

const noop = () => undefined;

export class LiveLoop {
  private run = 0;
  private active = false;
  private inFlight: Promise<unknown> | null = null;
  private sleep: CancellableSleep | null = null;

  constructor(private readonly deps: LiveLoopDeps) {}

  /** True while the loop is running. */
  get running(): boolean {
    return this.active;
  }

  /** Starts the loop; no-op when already running. */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.run += 1;
    void this.loop(this.run);
  }

  /**
   * Ends the loop. The in-flight frame (if any) is discarded.
   * @returns A promise that resolves once the in-flight request has settled
   */
  stop(): Promise<void> {
    this.active = false;
    this.run += 1;
    this.sleep?.cancel();
    const pending = this.inFlight;
    return pending ? pending.then(noop, noop) : Promise.resolve();
  }

  private alive(run: number): boolean {
    return this.active && this.run === run;
  }

  private async loop(run: number): Promise<void> {
    const { minPeriodMs = MIN_FRAME_PERIOD_MS, maxFailures = MAX_FAILURES } =
      this.deps;
    let failures = 0;
    while (this.alive(run)) {
      await this.deps.yieldToCommands();
      if (!this.alive(run)) break;
      const startedAt = this.deps.now();
      try {
        const request = this.deps.fetchFrame();
        this.inFlight = request;
        const frame = await request;
        if (!this.alive(run)) break;
        failures = 0;
        this.deps.onFrame(frame);
      } catch (err) {
        if (!this.alive(run)) break;
        failures += 1;
        if (failures >= maxFailures) {
          this.active = false;
          this.deps.onGiveUp(err);
          break;
        }
      }
      const wait = Math.max(0, minPeriodMs - (this.deps.now() - startedAt));
      this.sleep = cancellableSleep(wait);
      await this.sleep.promise;
    }
  }
}
