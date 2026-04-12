import { StatusBadge } from "./StatusBadge";

interface DeviceCardProps {
  label: string;
  id: string;
  status: "ONLINE" | "LOCKED" | "OFFLINE" | "ERROR";
  ipAddress: string;
  onOpen: () => void;
}

export function DeviceCard({
  label,
  id,
  status,
  ipAddress,
  onOpen,
}: DeviceCardProps) {
  return (
    <div className="bg-white border-2 border-(--lab-border) rounded p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-(--lab-text-primary)">
            {label}
          </h3>
          <p className="text-xs text-(--lab-text-secondary) mt-0.5">
            ID: {id}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <p className="font-mono text-xs text-(--lab-text-secondary)">
        {ipAddress}
      </p>

      <button
        onClick={onOpen}
        disabled={status === "OFFLINE"}
        className={`w-full py-2 px-4 border-2 rounded font-medium text-sm transition-colors ${
          status === "OFFLINE"
            ? "border-(--lab-border)] bg-(--lab-panel) text-[var(--lab-text-secondary) cursor-not-allowed"
            : "border-(--lab-accent)] bg-white text-(--lab-accent) hover:bg-[var(--lab-accent) hover:text-white"
        }`}
      >
        Open
      </button>
    </div>
  );
}
