import { Download, Flag, Trash2 } from "lucide-react";

interface ArtifactRowProps {
  timestamp: string;
  device: string;
  type: string;
  channel?: string;
  fileSize: string;
  uploadStatus: "pending" | "uploading" | "done" | "error";
  selected: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onFlag: () => void;
  onDelete: () => void;
}

export function ArtifactRow({
  timestamp,
  device,
  type,
  channel,
  fileSize,
  uploadStatus,
  selected,
  onSelect,
  onDownload,
  onFlag,
  onDelete,
}: ArtifactRowProps) {
  const statusColors = {
    pending: "#94A3B8",
    uploading: "#3B82F6",
    done: "#22C55E",
    error: "#EF4444",
  };

  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-4 items-center px-4 py-2 border-b-2 border-(--lab-border) hover:bg-(--lab-panel) ${
        selected ? "bg-(--lab-panel)" : "bg-white"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        className="w-4 h-4 accent-(--lab-accent)"
      />

      <div className="grid grid-cols-4 gap-4 font-mono text-xs">
        <span className="text-(--lab-text-primary)">{timestamp}</span>
        <span className="text-(--lab-text-secondary)">{device}</span>
        <span className="text-(--lab-text-secondary)">{type}</span>
        <span className="text-(--lab-text-secondary)">{channel || "—"}</span>
      </div>

      <span className="font-mono text-xs text-(--lab-text-secondary)">
        {fileSize}
      </span>

      <div className="flex items-center gap-1">
        <div
          className="w-2 h-2 rounded-full border"
          style={{
            backgroundColor: statusColors[uploadStatus],
            borderColor: statusColors[uploadStatus],
          }}
        />
        <span className="text-xs text-(--lab-text-secondary) capitalize">
          {uploadStatus}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onDownload}
          className="p-1.5 border-2 border-transparent hover:border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-text-primary)"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={onFlag}
          className="p-1.5 border-2 border-transparent hover:border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-warning)"
          title="Flag for OpenBIS upload"
        >
          <Flag className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 border-2 border-transparent hover:border-(--lab-border) hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-(--lab-danger)"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
