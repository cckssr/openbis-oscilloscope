import { useCallback, useState } from "react";
import { listDevices, releaseLock } from "../../../../api/devices";
import type { Device } from "../../../../api/types";
import { de } from "../../../../i18n/de";
import { notifyError } from "../../../../lib/notify";
import { useAuth } from "../../../context/AuthContext";
import { useDeviceSessionRegistry } from "../../../state/deviceSession";
import { useDeviceActions } from "../actions/session";

/**
 * Devices other than `deviceId` that the current user has locked.
 * @param token - Bearer token
 * @param deviceId - The device about to be taken
 * @returns The user's other locked devices; empty when the list cannot be read (taking then just proceeds)
 */
export async function findOtherLocks(
  token: string | null,
  deviceId: string,
): Promise<Device[]> {
  if (!token) return [];
  try {
    const devices = await listDevices(token);
    return devices.filter((d) => d.id !== deviceId && d.lock?.is_mine === true);
  } catch {
    return [];
  }
}

export interface TakeControlModel {
  /** Click handler of "Gerät übernehmen": asks first when another device is already locked. */
  request: () => void;
  /** True while the lock list is read (the button waits). */
  checking: boolean;
  /** Props of {@link OtherLockDialog}. */
  dialog: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    deviceNames: string[];
    onSwitch: () => void;
    onKeepBoth: () => void;
  };
}

/**
 * Take-control flow of the header button. When the user already holds another
 * device, `request` opens a confirmation (cancel / keep both / release the
 * other one first) instead of silently locking a second device.
 *
 * @param deviceId - The device to take
 * @returns Click handler, busy flag and dialog props
 */
export function useTakeControl(deviceId: string): TakeControlModel {
  const { token } = useAuth();
  const registry = useDeviceSessionRegistry();
  const actions = useDeviceActions(deviceId);
  const [others, setOthers] = useState<Device[]>([]);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const request = useCallback(() => {
    setChecking(true);
    void findOtherLocks(token, deviceId)
      .then((held) => {
        if (held.length === 0) {
          void actions.takeControl();
          return;
        }
        setOthers(held);
        setOpen(true);
      })
      .finally(() => setChecking(false));
  }, [token, deviceId, actions]);

  /**
   * Releases the other devices; through their store when this tab holds them
   * (it stops the heartbeat and reports its own errors), otherwise through the API.
   * @returns True when every other device is free now
   */
  const releaseOthers = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all(
      others.map(async (d) => {
        const store = registry?.peek(d.id);
        if (store && store.getState().lock.status === "held") {
          await store.actions.release();
          return store.getState().lock.status !== "held";
        }
        if (!token || !d.lock?.session_id) return true;
        try {
          await releaseLock(token, d.id, d.lock.session_id);
          return true;
        } catch (err) {
          notifyError(
            err,
            de.control.session.lock.releaseFailed,
            de.control.session.lock.releaseFailedTitle,
          );
          return false;
        }
      }),
    );
    return results.every(Boolean);
  }, [others, registry, token]);

  return {
    request,
    checking,
    dialog: {
      open,
      onOpenChange: setOpen,
      deviceNames: others.map((d) => d.label || d.id),
      onKeepBoth: () => void actions.takeControl(),
      onSwitch: () =>
        void releaseOthers().then(async (ok) => {
          if (ok) await actions.takeControl();
        }),
    },
  };
}
