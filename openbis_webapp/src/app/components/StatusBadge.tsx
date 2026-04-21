type StatusType = "ONLINE" | "LOCKED" | "OFFLINE" | "BUSY" | "ERROR";

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const styles: Record<StatusType, string> = {
    ONLINE:
      "bg-white text-(--lab-success)] border-[var(--lab-success) border-2",
    LOCKED:
      "bg-white text-(--lab-warning)] border-[var(--lab-warning) border-2",
    BUSY: "bg-white text-(--lab-warning)] border-[var(--lab-warning) border-2",
    OFFLINE:
      "bg-white text-(--lab-text-secondary)] border-[var(--lab-border) border-2",
    ERROR: "bg-white text-(--lab-danger)] border-[var(--lab-danger) border-2",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${styles[status]} ${className}`}
    >
      {status}
    </span>
  );
}
