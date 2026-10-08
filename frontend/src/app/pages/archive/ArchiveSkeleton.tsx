import { Skeleton } from "../../components/ui/skeleton";

/** Placeholder rows while the artifact list loads. */
export function ArchiveSkeleton() {
  return (
    <div
      className="flex flex-col gap-2 p-4"
      aria-busy="true"
      aria-label="Lade Messdaten"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
