import { createBrowserRouter } from "react-router";
import { DeviceList } from "./pages/DeviceList";
import { OscilloscopeControl } from "./pages/OscilloscopeControl";
import { DataArchive } from "./pages/DataArchive";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: DeviceList,
  },
  {
    path: "/device/:deviceId",
    Component: OscilloscopeControl,
  },
  {
    path: "/archive",
    Component: DataArchive,
  },
]);
