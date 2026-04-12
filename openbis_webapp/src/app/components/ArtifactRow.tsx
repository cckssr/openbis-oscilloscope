import { Flag } from "lucide-react";

interface ArtifactRowProps {
  artifactId: string;
  timestamp: string;
  type: string;
  channel?: string;
  files: string[];
  persist: boolean;
  selected: boolean;
  onSelect: () => void;
  /** Called with the new desired persist value when the flag button is clicked. */
  onFlag: (persist: boolean) => void;
}

export function ArtifactRow({
  timestamp,
  type,
  channel,
  files,
  persist,
  selected,
  onSelect,
  onFlag,
}: ArtifactRowProps) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-2 border-b-2 border-(--lab-border) hover:bg-(--lab-panel) ${
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
        <span className="text-(--lab-text-secondary)">{type}</span>
        <span className="text-(--lab-text-secondary)">{channel ?? "—"}</span>
        <span className="text-(--lab-text-secondary)">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Persist flag indicator */}
      <div className="flex items-center gap-1">
        <div
          className="w-2 h-2 rounded-full border"
          style={{
            backgroundColor: persist
              ? "var(--lab-warning)"
              : "var(--lab-border)",
            borderColor: persist ? "var(--lab-warning)" : "var(--lab-border)",
          }}
        />
        <span className="text-xs text-(--lab-text-secondary)">
          {persist ? "Flagged" : "—"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onFlag(!persist)}
          className={`p-1.5 border-2 rounded transition-colors ${
            persist
              ? "border-(--lab-warning) text-(--lab-warning) bg-white"
              : "border-transparent hover:border-(--lab-border) hover:bg-(--lab-panel) text-(--lab-text-secondary) hover:text-(--lab-warning)"
          }`}
          title={persist ? "Remove flag" : "Flag for OpenBIS upload"}
        >
          <Flag className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
