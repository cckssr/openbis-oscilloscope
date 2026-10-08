import { useParams } from "react-router";
import { ControlPage } from "./control/ControlPage";

/**
 * Route entry of `/device/:deviceId` (lazy-loaded by `routes.tsx`). The page
 * itself lives in `pages/control/`; this file only reads the route parameter.
 *
 * @returns The control page of the device in the URL
 */
export function OscilloscopeControl() {
  const { deviceId } = useParams<{ deviceId: string }>();
  return <ControlPage deviceId={deviceId ?? ""} />;
}
