import { Database } from "lucide-react";
import { Link } from "react-router";
import { de } from "../../../../i18n/de";
import { Button } from "../../../components/ui/button";
import { archivePath } from "./model";

const t = de.control.page.header;

export interface ArchiveLinkProps {
  sessionId?: string;
  count: number;
}

/**
 * "Messdaten (n)" link to the archive of the current (or last released)
 * session; stays reachable after releasing the device. Falls back to the
 * session list.
 *
 * @param props - See {@link ArchiveLinkProps}
 * @returns The link button
 */
export function ArchiveLink({ sessionId, count }: ArchiveLinkProps) {
  return (
    <Button asChild variant="secondary">
      <Link to={archivePath(sessionId)} title={sessionId ? t.dataTitle : t.dataTitleNone}>
        <Database aria-hidden />
        {t.data(count)}
      </Link>
    </Button>
  );
}
