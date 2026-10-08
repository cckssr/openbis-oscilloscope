import JSZip from "jszip";
import { alignTraces } from "./csv";
import { toNpy } from "./npy";
import type { ExportInput, Exporter } from "./types";

/**
 * Packs traces into an uncompressed `.npz` (like `numpy.savez`): `time_s`
 * (or `freq_Hz`) plus one array per trace named after its id (`CH1`, …).
 * Load with `np.load("x.npz")["CH1"]`.
 * @param input - Export input with traces
 * @returns The zip as a Blob
 */
export async function buildNpz(input: ExportInput): Promise<Blob> {
  const traces = input.traces ?? [];
  const { x, columns } = alignTraces(traces);
  const zip = new JSZip();
  zip.file(traces[0].xUnit === "Hz" ? "freq_Hz.npy" : "time_s.npy", toNpy(x));
  traces.forEach((t, i) => zip.file(`${t.id}.npy`, toNpy(columns[i])));
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

export const npzExporter: Exporter = {
  id: "npz",
  label: "NumPy (.npz)",
  ext: "npz",
  appliesTo: "capture",
  isAvailable: (input) => !!input.traces?.length,
  run: buildNpz,
};
