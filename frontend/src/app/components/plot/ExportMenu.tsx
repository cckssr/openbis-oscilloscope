import { useState } from "react";
import { ChevronDown, Download, LoaderCircle } from "lucide-react";
import { de } from "../../../i18n/de";
import {
  listExporters,
  runExporter,
  type ExportInput,
  type Exporter,
} from "../../../lib/export";
import { notifyError } from "../../../lib/notify";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const t = de.plot.export;

interface ExportMenuProps {
  /** What can be exported; exporters whose requirements are missing are hidden. */
  input: ExportInput;
  className?: string;
}

/**
 * "Exportieren ▾" menu listing every registered exporter that is applicable to
 * `input` (CSV, NumPy, PNG, HDF5, ZIP …). Shows a spinner while an export runs
 * and toasts failures.
 * @param props - See {@link ExportMenuProps}
 * @returns The menu button
 */
export function ExportMenu({ input, className }: ExportMenuProps) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const exporters = listExporters(input);
  const busy = runningId !== null;

  const run = async (exporter: Exporter) => {
    setRunningId(exporter.id);
    try {
      await runExporter(exporter, input);
    } catch (err) {
      notifyError(err, t.failedFallback, t.failed);
    } finally {
      setRunningId(null);
    }
  };

  const disabled = exporters.length === 0 || busy;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={className}
          disabled={disabled}
          title={
            exporters.length === 0 ? t.noneHint : busy ? t.running : undefined
          }
        >
          {busy ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          {busy ? t.running : t.button}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {exporters.map((e) => (
          <DropdownMenuItem
            key={e.id}
            onSelect={() => void run(e)}
            className="coarse:min-h-11"
          >
            {e.label}
            <span className="ml-auto pl-3 font-mono text-xs text-(--lab-text-secondary)">
              .{e.ext}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
