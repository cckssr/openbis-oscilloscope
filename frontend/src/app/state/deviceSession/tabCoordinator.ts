/**
 * Second-tab coordination (review A12) over `BroadcastChannel("osc-device-<id>")`.
 *
 * Only one tab of a browser may control a device. Protocol:
 * - `query`: a starting tab asks "does anyone control this device?"
 * - `controlling`: the controlling tab answers with its session id
 * - `takeover`: a tab takes control; the previous controller turns passive
 * - `released` / `lost`: the controller gave the lock back / lost it; passive tabs follow
 *
 * Without `BroadcastChannel` every method is a no-op and the tab behaves as a
 * single tab.
 */

/** Minimal subset of `BroadcastChannel` the coordinator needs (eases testing). */
export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  close(): void;
}

/** Creates a channel for a name, or null when the browser has none. */
export type ChannelFactory = (name: string) => ChannelLike | null;

/**
 * Default factory using the browser's `BroadcastChannel`.
 * @param name - Channel name
 * @returns A channel, or null when unsupported
 */
export const defaultChannelFactory: ChannelFactory = (name) =>
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(name);

type TabMessage =
  | { type: "query"; from: string }
  | { type: "controlling"; from: string; to: string; sessionId: string }
  | { type: "takeover"; from: string; sessionId: string }
  | { type: "released"; from: string; sessionId: string }
  | { type: "lost"; from: string; sessionId: string };

/** What the coordinator asks of / tells the owning store. */
export interface TabHandlers {
  /** Session id if this tab currently controls the device, else null. */
  controllingSessionId(): string | null;
  /** Another tab took control: stop loops and heartbeat, keep the lock. */
  onTakenOver(sessionId: string): void;
  /** The controlling tab released the lock. */
  onReleasedElsewhere(sessionId: string): void;
  /** The controlling tab lost the lock. */
  onLostElsewhere(sessionId: string): void;
}

export class TabCoordinator {
  private channel: ChannelLike | null = null;
  private waiters = new Map<string, (sessionId: string | null) => void>();

  /**
   * @param deviceId - Device the channel is scoped to
   * @param tabId - Unique id of this tab
   * @param handlers - Callbacks into the store
   * @param factory - Channel factory (injectable for tests)
   */
  constructor(
    private readonly deviceId: string,
    private readonly tabId: string,
    private readonly handlers: TabHandlers,
    private readonly factory: ChannelFactory = defaultChannelFactory,
  ) {}

  /** True when cross-tab messaging is available. */
  get available(): boolean {
    return this.channel !== null;
  }

  /** Opens the channel; safe to call more than once. */
  open(): void {
    if (this.channel) return;
    try {
      this.channel = this.factory(`osc-device-${this.deviceId}`);
    } catch {
      this.channel = null;
    }
    if (this.channel) this.channel.onmessage = (e) => this.receive(e.data);
  }

  /** Closes the channel and resolves pending queries with null. */
  close(): void {
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
    }
    this.channel = null;
    this.waiters.forEach((resolve) => resolve(null));
    this.waiters.clear();
  }

  /**
   * Asks the other tabs whether one of them controls the device.
   * @param timeoutMs - How long to wait for an answer
   * @returns The session id the other tab controls, or null when nobody answered
   */
  queryController(timeoutMs = 300): Promise<string | null> {
    if (!this.channel) return Promise.resolve(null);
    return new Promise((resolve) => {
      const key = `${this.tabId}:${Math.random()}`;
      const timer = setTimeout(() => {
        this.waiters.delete(key);
        resolve(null);
      }, timeoutMs);
      this.waiters.set(key, (sessionId) => {
        clearTimeout(timer);
        this.waiters.delete(key);
        resolve(sessionId);
      });
      this.post({ type: "query", from: this.tabId });
    });
  }

  /**
   * Tells the other tabs this tab now controls the device.
   * @param sessionId - The control session
   */
  announceTakeover(sessionId: string): void {
    this.post({ type: "takeover", from: this.tabId, sessionId });
  }

  /**
   * Tells the other tabs the lock was released.
   * @param sessionId - The released session
   */
  announceReleased(sessionId: string): void {
    this.post({ type: "released", from: this.tabId, sessionId });
  }

  /**
   * Tells the other tabs the lock was lost.
   * @param sessionId - The lost session
   */
  announceLost(sessionId: string): void {
    this.post({ type: "lost", from: this.tabId, sessionId });
  }

  private post(message: TabMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // channel closed — behave as a single tab
    }
  }

  private receive(data: unknown): void {
    const msg = data as TabMessage | null;
    if (!msg || typeof msg !== "object" || msg.from === this.tabId) return;
    switch (msg.type) {
      case "query": {
        const sessionId = this.handlers.controllingSessionId();
        if (sessionId) {
          this.post({
            type: "controlling",
            from: this.tabId,
            to: msg.from,
            sessionId,
          });
        }
        break;
      }
      case "controlling":
        if (msg.to === this.tabId) {
          this.waiters.forEach((resolve) => resolve(msg.sessionId));
        }
        break;
      case "takeover":
        this.handlers.onTakenOver(msg.sessionId);
        break;
      case "released":
        this.handlers.onReleasedElsewhere(msg.sessionId);
        break;
      case "lost":
        this.handlers.onLostElsewhere(msg.sessionId);
        break;
    }
  }
}
