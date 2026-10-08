import { downloadArtifactsZip, exportArtifactsHdf5 } from "../../api/sessions";
import type { ExportInput, Exporter } from "./types";

const hasArtifacts = (i: ExportInput) => !!(i.token && i.sessionId && i.artifactIds?.length);

export const hdf5Exporter: Exporter = {
  id: "hdf5",
  label: "HDF5 (vom Server)",
  ext: "h5",
  appliesTo: "selection",
  isAvailable: hasArtifacts,
  run: (i) => exportArtifactsHdf5(i.token!, i.sessionId!, i.artifactIds!),
};

export const zipExporter: Exporter = {
  id: "zip",
  label: "ZIP mit allen Dateien (vom Server)",
  ext: "zip",
  appliesTo: "selection",
  isAvailable: hasArtifacts,
  run: (i) => downloadArtifactsZip(i.token!, i.sessionId!, i.artifactIds!),
};
