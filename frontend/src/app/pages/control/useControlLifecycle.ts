import { useEffect } from "react";
import { de } from "../../../i18n/de";
import { useDeviceActions } from "./actions/session";

/**
 * Page lifecycle of the control page: live resumes on mount and pauses on
 * unmount (leaving the page, review A10), capture counts are re-read (the
 * archive may have uploaded captures) and the document title names the device.
 *
 * @param deviceId - The device
 * @param label - Device label for the title, if loaded
 */
export function useControlLifecycle(
  deviceId: string,
  label: string | undefined,
): void {
  const actions = useDeviceActions(deviceId);

  useEffect(() => {
    actions.resumeLive();
    void actions.refreshCounts();
    return () => actions.pauseLive();
  }, [actions]);

  useEffect(() => {
    const previous = document.title;
    document.title = de.control.page.documentTitle(label ?? deviceId);
    return () => {
      document.title = previous;
    };
  }, [deviceId, label]);
}
