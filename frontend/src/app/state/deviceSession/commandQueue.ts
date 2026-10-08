/**
 * One promise queue per device (review §5.4). Every command that talks to the
 * scope runs through it, one at a time, mirroring the backend queue. The label
 * of the running command is published as `busy`, which the UI uses as the
 * reason for disabled buttons.
 */
import { DisposedError } from "./context";

export class CommandQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private outstanding = 0;
  private idleWaiters: Array<() => void> = [];

  /**
   * @param onBusy - Called with the running command's label, or null when idle
   * @param isDisposed - Queued commands are skipped once this returns true
   */
  constructor(
    private readonly onBusy: (label: string | null) => void,
    private readonly isDisposed: () => boolean,
  ) {}

  /** True when no command is running or waiting. */
  get isIdle(): boolean {
    return this.outstanding === 0;
  }

  /**
   * Appends a command. It starts after all earlier ones finished; a failing
   * command rejects only its own promise.
   * @param label - German label published as `busy` while it runs
   * @param fn - The command
   * @returns The command's result
   */
  run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (this.isDisposed()) return Promise.reject(new DisposedError());
    if (this.outstanding === 0) this.onBusy(label);
    this.outstanding += 1;
    const task = this.tail.then(async () => {
      try {
        if (this.isDisposed()) throw new DisposedError();
        this.onBusy(label);
        return await fn();
      } finally {
        this.outstanding -= 1;
        if (this.outstanding === 0) {
          this.onBusy(null);
          const waiters = this.idleWaiters;
          this.idleWaiters = [];
          waiters.forEach((w) => w());
        }
      }
    });
    this.tail = task.catch(() => undefined);
    return task;
  }

  /**
   * Resolves when no command is running or waiting. The live loop awaits this
   * before every frame so user commands are never starved.
   * @returns A promise that resolves once the queue is idle
   */
  whenIdle(): Promise<void> {
    if (this.outstanding === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Releases everything that waits for the queue (used on dispose). */
  releaseWaiters(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((w) => w());
  }
}
