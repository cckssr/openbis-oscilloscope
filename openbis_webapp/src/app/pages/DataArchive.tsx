import { useState } from "react";
import { useNavigate } from "react-router";
import { ArtifactRow } from "../components/ArtifactRow";
import { ArrowLeft, Upload } from "lucide-react";

const mockArtifacts = [
  {
    id: 1,
    timestamp: "2026-04-12 14:32:15",
    device: "OSC-001",
    type: "Waveform CSV",
    channel: "CH1,CH2",
    fileSize: "2.3 MB",
    uploadStatus: "done" as const,
  },
  {
    id: 2,
    timestamp: "2026-04-12 14:28:42",
    device: "OSC-001",
    type: "Screenshot PNG",
    channel: undefined,
    fileSize: "1.8 MB",
    uploadStatus: "pending" as const,
  },
  {
    id: 3,
    timestamp: "2026-04-12 14:15:33",
    device: "OSC-003",
    type: "Waveform HDF5",
    channel: "CH1-CH4",
    fileSize: "5.7 MB",
    uploadStatus: "done" as const,
  },
  {
    id: 4,
    timestamp: "2026-04-12 13:58:21",
    device: "OSC-002",
    type: "Waveform CSV",
    channel: "CH1",
    fileSize: "1.2 MB",
    uploadStatus: "uploading" as const,
  },
  {
    id: 5,
    timestamp: "2026-04-12 13:45:12",
    device: "OSC-001",
    type: "Screenshot PNG",
    channel: undefined,
    fileSize: "2.1 MB",
    uploadStatus: "error" as const,
  },
  {
    id: 6,
    timestamp: "2026-04-12 13:22:05",
    device: "OSC-006",
    type: "Waveform HDF5",
    channel: "CH1,CH2",
    fileSize: "4.5 MB",
    uploadStatus: "pending" as const,
  },
];

export function DataArchive() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === mockArtifacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(mockArtifacts.map((a) => a.id)));
    }
  };

  const handleBulkUpload = () => {
    console.log("Uploading selected items to OpenBIS:", Array.from(selected));
  };

  return (
    <div className="min-h-screen bg-(--lab-bg) flex flex-col">
      <header className="bg-white border-b-2 border-(--lab-border) px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-1.5 border-2 border-(--lab-border)] hover:bg-(--lab-panel) rounded text-(--lab-text-secondary) hover:text-[var(--lab-text-primary)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-(--lab-text-primary)">
            Data Archive
          </h1>
        </div>

        <button
          onClick={handleBulkUpload}
          disabled={selected.size === 0}
          className={`flex items-center gap-2 px-4 py-2 border-2 rounded font-medium text-sm transition-colors ${
            selected.size === 0
              ? "border-(--lab-border)] bg-(--lab-panel) text-[var(--lab-text-secondary) cursor-not-allowed"
              : "border-(--lab-accent)] bg-white text-(--lab-accent) hover:bg-[var(--lab-accent) hover:text-white"
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload to OpenBIS ({selected.size})
        </button>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="bg-(--lab-panel)] border-b-2 border-[var(--lab-border)">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-2 text-xs font-medium text-(--lab-text-secondary) uppercase">
            <input
              type="checkbox"
              checked={selected.size === mockArtifacts.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-(--lab-accent)"
            />
            <div className="grid grid-cols-4 gap-4">
              <span>Timestamp</span>
              <span>Device</span>
              <span>Type</span>
              <span>Channel</span>
            </div>
            <span>Size</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
        </div>

        <div>
          {mockArtifacts.map((artifact) => (
            <ArtifactRow
              key={artifact.id}
              timestamp={artifact.timestamp}
              device={artifact.device}
              type={artifact.type}
              channel={artifact.channel}
              fileSize={artifact.fileSize}
              uploadStatus={artifact.uploadStatus}
              selected={selected.has(artifact.id)}
              onSelect={() => toggleSelect(artifact.id)}
              onDownload={() => console.log("Download", artifact.id)}
              onFlag={() => console.log("Flag for upload", artifact.id)}
              onDelete={() => console.log("Delete", artifact.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
