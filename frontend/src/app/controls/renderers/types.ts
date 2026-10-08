import type { SettingPath } from "../../state/deviceSession/types";
import type { ControlContext } from "../types";

/** Props shared by the generic renderers. */
export interface ControlProps<D> {
  deviceId: string;
  def: D;
  /** Store path of this control (`channels.1.scale_v_div`). */
  path: SettingPath;
  ctx: ControlContext;
  /** Read-only (no control of the device, or a command is blocking). */
  disabled?: boolean;
  /** Tooltip explaining why the control is disabled. */
  disabledReason?: string;
}
