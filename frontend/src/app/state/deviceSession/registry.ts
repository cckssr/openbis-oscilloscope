/** Lazily created `deviceId -> store` map for one auth token. */
import { DeviceSessionStore, type DeviceSessionStoreOptions } from "./store";

export class DeviceSessionRegistry {
  private readonly stores = new Map<string, DeviceSessionStore>();

  /**
   * @param token - Bearer token every store of this registry uses
   * @param storeOptions - Extra store options (tests inject channels and clocks)
   */
  constructor(
    readonly token: string,
    private readonly storeOptions: Omit<DeviceSessionStoreOptions, "deviceId" | "token"> = {},
  ) {}

  /**
   * Returns the store of a device, creating it on first use. Creating a store
   * has no side effects; call `store.start()` to talk to the backend.
   * @param deviceId - The device
   * @returns The (shared) store
   */
  get(deviceId: string): DeviceSessionStore {
    let store = this.stores.get(deviceId);
    if (!store) {
      store = new DeviceSessionStore({ ...this.storeOptions, deviceId, token: this.token });
      this.stores.set(deviceId, store);
    }
    return store;
  }

  /** Disposes all stores (logout / token change). Locks are not released. */
  disposeAll(): void {
    this.stores.forEach((store) => store.dispose());
    this.stores.clear();
  }
}
