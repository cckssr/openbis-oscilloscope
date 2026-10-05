type StatusType = "ONLINE" | "LOCKED" | "OFFLINE" | "BUSY" | "ERROR";

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const styles: Record<StatusType, string> = {
    ONLINE: "bg-white text-(--lab-success) border-2 border-(--lab-success)",
    LOCKED: "bg-white text-(--lab-warning) border-2 border-(--lab-warning)",
    BUSY: "bg-white text-(--lab-warning) border-2 border-(--lab-warning)",
    OFFLINE:
      "bg-white text-(--lab-text-secondary) border-2 border-(--lab-border)",
    ERROR: "bg-white text-(--lab-danger) border-2 border-(--lab-danger)",
  };

  const labels: Record<StatusType, string> = {
    ONLINE: "Online",
    LOCKED: "Gesperrt",
    BUSY: "Beschäftigt",
    OFFLINE: "Offline",
    ERROR: "Fehler",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${styles[status]} ${className}`}
      data-status={status}
    >
      {labels[status]}
    </span>
  );
}
