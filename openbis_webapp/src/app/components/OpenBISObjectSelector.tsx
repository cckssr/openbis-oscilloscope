import { useEffect, useState } from "react";
import { listProjects, listCollections, listObjects } from "../../api/openbis_structure";
import type { ProjectOption, CollectionOption, ObjectOption } from "../../api/openbis_structure";

interface Props {
  token: string;
  onSelect: (values: {
    experimentId: string;
    sampleId: string;
    groupName: string;
    semester: string;
  }) => void;
}

export function OpenBISObjectSelector({ token, onSelect }: Props) {
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
      .then(setProjects)
      .catch(() => setError("Projekte konnten nicht geladen werden"))
      .finally(() => setLoadingProjects(false));
  }, [token]);

  const handleProjectChange = (code: string) => {
    setSelectedProject(code);
    setSelectedCollection("");
    setSelectedObject("");
    setCollections([]);
    setObjects([]);
    if (!code) return;
    setLoadingCollections(true);
    listCollections(token, code)
      .then(setCollections)
      .catch(() => setError("Sammlungen konnten nicht geladen werden"))
      .finally(() => setLoadingCollections(false));
  };

  const handleCollectionChange = (code: string) => {
    setSelectedCollection(code);
    setSelectedObject("");
    setObjects([]);
    if (!code) return;
    setLoadingObjects(true);
    listObjects(token, code)
      .then(setObjects)
      .catch(() => setError("Objekte konnten nicht geladen werden"))
      .finally(() => setLoadingObjects(false));
  };

  const handleObjectChange = (identifier: string) => {
    setSelectedObject(identifier);
    if (!identifier) return;
    const proj = projects.find((p) => p.code === selectedProject);
    onSelect({
      experimentId: selectedCollection,
      sampleId: identifier,
      groupName: proj?.group_name ?? "",
      semester: proj?.semester ?? "",
    });
  };

  const selectClass =
    "w-full border-2 border-(--lab-border) rounded px-2 py-1.5 text-sm focus:outline-none focus:border-(--lab-accent) bg-white disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-xs text-(--lab-danger)">{error}</p>}

      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">Gruppe</label>
        <div className="relative">
          <select
            value={selectedProject}
            onChange={(e) => handleProjectChange(e.target.value)}
            disabled={loadingProjects}
            className={selectClass}
          >
            <option value="">{loadingProjects ? "Laden…" : "— Gruppe auswählen —"}</option>
            {projects.map((p) => (
              <option key={p.code} value={p.code}>{p.display_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">Experiment</label>
        <select
          value={selectedCollection}
          onChange={(e) => handleCollectionChange(e.target.value)}
          disabled={!selectedProject || loadingCollections}
          className={selectClass}
        >
          <option value="">{loadingCollections ? "Laden…" : "— Experiment auswählen —"}</option>
          {collections.map((c) => (
            <option key={c.code} value={c.code}>{c.display_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-(--lab-text-secondary) mb-1">Probe / Objekt</label>
        <select
          value={selectedObject}
          onChange={(e) => handleObjectChange(e.target.value)}
          disabled={!selectedCollection || loadingObjects}
          className={selectClass}
        >
          <option value="">{loadingObjects ? "Laden…" : "— Objekt auswählen —"}</option>
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
