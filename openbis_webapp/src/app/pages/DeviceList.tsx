import { useState } from "react";
import { useNavigate } from "react-router";
import { DeviceCard } from "../components/DeviceCard";
import { LogOut } from "lucide-react";

const mockDevices = [
  {
    id: "OSC-001",
    label: "Tektronix MDO3024",
    status: "ONLINE" as const,
    ipAddress: "192.168.1.101",
  },
  {
    id: "OSC-002",
    label: "Keysight DSOX3024T",
    status: "LOCKED" as const,
    ipAddress: "192.168.1.102",
  },
  {
    id: "OSC-003",
    label: "Rigol DS1054Z",
    status: "ONLINE" as const,
    ipAddress: "192.168.1.103",
  },
  {
    id: "OSC-004",
    label: "Siglent SDS2104X",
    status: "OFFLINE" as const,
    ipAddress: "192.168.1.104",
  },
  {
    id: "OSC-005",
    label: "Tektronix TBS2104",
    status: "ERROR" as const,
    ipAddress: "192.168.1.105",
  },
  {
    id: "OSC-006",
    label: "Keysight MSOX3024T",
    status: "ONLINE" as const,
    ipAddress: "192.168.1.106",
  },
];

export function DeviceList() {
  const navigate = useNavigate();
  const [user] = useState("Dr. Sarah Chen");

  return (
    <div className="min-h-screen bg-(--lab-bg)">
      <header className="bg-white border-b-2 border-(--lab-border) px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-(--lab-text-primary)">
          Oscilloscope Control System
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-(--lab-text-secondary)">{user}</span>
          <button className="flex items-center gap-2 px-3 py-1.5 border-2 border-(--lab-border)] text-sm text-(--lab-text-secondary)] hover:text-(--lab-text-primary) hover:bg-(--lab-panel) rounded transition-colors">
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockDevices.map((device) => (
            <DeviceCard
              key={device.id}
              label={device.label}
              id={device.id}
              status={device.status}
              ipAddress={device.ipAddress}
              onOpen={() => navigate(`/device/${device.id}`)}
            />
          ))}
        </div>

        {mockDevices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-(--lab-text-secondary)">No devices available</p>
            <p className="text-sm text-(--lab-text-secondary) mt-1">
              Check network connection or add devices
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
