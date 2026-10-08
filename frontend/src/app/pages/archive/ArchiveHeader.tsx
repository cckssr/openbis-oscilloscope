import { RefreshCw, Upload } from "lucide-react";
import { Button } from "../../components/ui/button";
import { DisabledReason, PageHeader } from "../../components/common";
import { ExportMenu } from "../../components/plot/ExportMenu";
import { de } from "../../../i18n/de";
import type { ExportInput } from "../../../lib/export/types";

const t = de.archive;

interface ArchiveHeaderProps {
  title: string;
  subtitle: string;
  backTo: string;
  backLabel: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  /** Artifact ids of the captures selected for upload, offered to the export menu. */
  selectionExport: ExportInput;
  zipBusy: boolean;
  onDownloadAll: () => void;
  uploadCount: number;
  onUpload: () => void;
}

/**
 * Header of the archive: back button, title with device/session info, refresh,
 * export for the selection, "Alle als ZIP" and the one primary "Hochladen (n)" button.
 * @param props - See {@link ArchiveHeaderProps}
 * @returns The page header
 */
export function ArchiveHeader({
  title,
  subtitle,
  backTo,
  backLabel,
  isRefreshing,
  onRefresh,
  selectionExport,
  zipBusy,
  onDownloadAll,
  uploadCount,
  onUpload,
}: ArchiveHeaderProps) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      backTo={backTo}
      backLabel={backLabel}
      actions={
        <>
          <Button
            variant="secondary"
            size="icon"
            onClick={onRefresh}
            aria-label={t.refresh}
            title={t.refresh}
          >
            <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
          </Button>
          <ExportMenu input={selectionExport} />
          <Button variant="secondary" onClick={onDownloadAll} disabled={zipBusy}>
            {zipBusy ? "…" : t.export.allZip}
          </Button>
          <DisabledReason reason={uploadCount === 0 ? t.upload.reasonNone : null}>
            <Button variant="primary" onClick={onUpload} disabled={uploadCount === 0}>
              <Upload /> {t.upload.button(uploadCount)}
            </Button>
          </DisabledReason>
        </>
      }
    />
  );
}
