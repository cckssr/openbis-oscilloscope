import { useEffect, useState } from "react";
import {
  listProjects,
  listCollections,
  listObjects,
} from "../../api/openbis_structure";
import type {
  ProjectOption,
  CollectionOption,
  ObjectOption,
} from "../../api/openbis_structure";

interface Props {
  token: string;
  disabled?: boolean;
  onSelect: (values: {
    experimentId: string;
    sampleId: string;
    groupName: string;
    semester: string;
  }) => void;
}

// German weekday prefix → sort order (0–4 = Mon–Fri, 10 = other)
const WEEKDAY_ORDER: Record<string, number> = {
  montag: 0,
  dienstag: 1,
  mittwoch: 2,
  donnerstag: 3,
  freitag: 4,
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  mo: 0,
  di: 1,
  mi: 2,
  do: 3,
  fr: 4,
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
};

function weekdayRank(name: string): number {
  const lower = name.toLowerCase();
  for (const [day, order] of Object.entries(WEEKDAY_ORDER)) {
    if (lower.startsWith(day)) return order;
  }
  return 10;
}

function sortedProjects(list: ProjectOption[]): ProjectOption[] {
  return [...list].sort((a, b) => {
    const da = weekdayRank(a.display_name);
    const db = weekdayRank(b.display_name);
    if (da !== db) return da - db;
    return a.display_name.localeCompare(b.display_name);
  });
}

function sortedCollections(list: CollectionOption[]): CollectionOption[] {
  return [...list].sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export function OpenBISObjectSelector({
  token,
  disabled = false,
  onSelect,
}: Props) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [objects, setObjects] = useState<ObjectOption[]>([]);

  const [selectedProject, setSelectedProject] = useState("");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [selectedObject, setSelectedObject] = useState("");

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingProjects(true);
    setError(null);
    listProjects(token)
      .then((list) => setProjects(sortedProjects(list)))
      .catch(() => setError("Projekte konnten nicht geladen werden"))
      .finally(() => setLoadingProjects(false));
  }, [token]);

  const handleProjectChange = (code: string) => {
    setSelectedProject(code);
    setSelectedCollection("");
    setSelectedObject("");
    setCollections([]);
    setObjects([]);
    if (!code) {
      onSelect({ experimentId: "", sampleId: "", groupName: "", semester: "" });
      return;
    }
    setLoadingCollections(true);
    listCollections(token, code)
      .then((list) => setCollections(sortedCollections(list)))
      .catch(() => setError("Sammlungen konnten nicht geladen werden"))
      .finally(() => setLoadingCollections(false));
  };

  const handleCollectionChange = (code: string) => {
    setSelectedCollection(code);
    setSelectedObject("");
    setObjects([]);
    const proj = projects.find((p) => p.code === selectedProject);
    if (!code) {
      onSelect({
        experimentId: "",
        sampleId: "",
        groupName: proj?.group_name ?? "",
        semester: proj?.semester ?? "",
      });
      return;
    }
    const col = collections.find((c) => c.code === code);
    // Selecting a collection alone is a valid upload target; use full identifier
    onSelect({
      experimentId: col?.identifier ?? code,
      sampleId: "",
      groupName: proj?.group_name ?? "",
      semester: proj?.semester ?? "",
    });
    setLoadingObjects(true);
    listObjects(token, code)
      .then(setObjects)
      .catch(() => setError("Objekte konnten nicht geladen werden"))
      .finally(() => setLoadingObjects(false));
  };

  const handleObjectChange = (identifier: string) => {
    setSelectedObject(identifier);
    const proj = projects.find((p) => p.code === selectedProject);
    const col = collections.find((c) => c.code === selectedCollection);
    // If an object is selected, use it as the upload target; otherwise fall back to collection
    onSelect({
      experimentId: identifier || col?.identifier || selectedCollection,
      sampleId: "",
      groupName: proj?.group_name ?? "",
      semester: proj?.semester ?? "",
    });
  };

  const selectClass =
    "w-full border-2 border-(--lab-border) rounded px-2 py-1.5 text-sm focus:outline-none focus:border-(--lab-accent) bg-white disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div
      className={`flex flex-col gap-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      {error && <p className="text-xs text-(--lab-danger)">{error}</p>}

      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">
          Gruppe (OpenBIS Project)
        </label>
        <select
          value={selectedProject}
          onChange={(e) => handleProjectChange(e.target.value)}
          disabled={loadingProjects || disabled}
          className={selectClass}
        >
          <option value="">
            {loadingProjects ? "Laden…" : "— Gruppe auswählen —"}
          </option>
          {projects.map((p) => (
            <option key={p.code} value={p.code}>
              {p.display_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">
          Collection{" "}
          <span className="text-(--lab-accent) font-medium">← Upload-Ziel</span>
        </label>
        <select
          value={selectedCollection}
          onChange={(e) => handleCollectionChange(e.target.value)}
          disabled={!selectedProject || loadingCollections || disabled}
          className={selectClass}
        >
          <option value="">
            {loadingCollections ? "Laden…" : "— Collection auswählen —"}
          </option>
          {collections.map((c) => (
            <option key={c.code} value={c.code}>
              {c.display_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">
          Objekt{" "}
          <span className="italic">(optional — Upload direkt auf Objekt)</span>
        </label>
        <select
          value={selectedObject}
          onChange={(e) => handleObjectChange(e.target.value)}
          disabled={!selectedCollection || loadingObjects || disabled}
          className={selectClass}
        >
          <option value="">
            {loadingObjects ? "Laden…" : "— Objekt auswählen (optional) —"}
          </option>
          {objects.map((o) => (
            <option key={o.identifier} value={o.identifier}>
              {o.code} ({o.type})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
