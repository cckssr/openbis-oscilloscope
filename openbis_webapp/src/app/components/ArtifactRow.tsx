import { Eye, Flag } from "lucide-react";

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
  /** User-supplied label for this acquisition group. */
  annotation?: string | null;
  /** Object URL for a screenshot thumbnail image. */
  thumbnailUrl?: string | null;
  /** If provided, the row becomes clickable and an eye icon button is shown. */
  onPreview?: () => void;
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
  annotation,
  thumbnailUrl,
  onPreview,
}: ArtifactRowProps) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-2 border-b-2 border-(--lab-border) hover:bg-(--lab-panel) ${
        selected ? "bg-(--lab-panel)" : "bg-white"
      } ${onPreview ? "cursor-pointer" : ""}`}
      onClick={onPreview}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        onClick={(e) => e.stopPropagation()}
        className="w-4 h-4 accent-(--lab-accent)"
      />

      <div className="grid grid-cols-4 gap-4 font-mono text-xs">
        <span className="text-(--lab-text-primary)">{timestamp}</span>
        <div className="flex items-center gap-2">
          {thumbnailUrl && (
            <img src={thumbnailUrl} className="h-8 w-auto rounded border border-(--lab-border)" alt="screenshot" />
          )}
          <span className="text-(--lab-text-secondary)">{type}</span>
        </div>
        <div>
          {(() => {
            const chNum = channel?.match(/^CH(\d+)$/)?.[1];
            return (
              <span
                className="font-medium"
                style={{ color: chNum ? `var(--ch${chNum}-color)` : "var(--lab-text-secondary)" }}
              >
                {channel ?? "—"}
              </span>
            );
          })()}
          {annotation && (
            <p className="text-[10px] italic text-(--lab-text-secondary) truncate max-w-[120px]">
              {annotation}
            </p>
          )}
        </div>
        <span className="text-(--lab-text-secondary)">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Persist flag indicator — icon only */}
      <div
        className="w-2 h-2 rounded-full border"
        style={{
          backgroundColor: persist ? "var(--lab-warning)" : "var(--lab-border)",
          borderColor: persist ? "var(--lab-warning)" : "var(--lab-border)",
        }}
        title={persist ? "Flagged for upload" : "Not flagged"}
      />

      {/* Actions */}
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {onPreview && (
          <button
            onClick={onPreview}
            className="p-1.5 border-2 rounded transition-colors border-transparent hover:border-(--lab-border) hover:bg-(--lab-panel) text-(--lab-text-secondary)"
            title="Preview"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
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
