import type { Exporter } from "./types";

/** Converts a `data:` URL to a Blob without a network round trip. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

export const pngExporter: Exporter = {
  id: "png",
  label: "Bild des Plots (PNG)",
  ext: "png",
  appliesTo: "plot",
  isAvailable: (input) => !!input.plotElement,
  async run(input) {
    // Accept the graph div itself or any wrapper around it.
    const el = input.plotElement?.classList.contains("js-plotly-plot")
      ? input.plotElement
      : input.plotElement?.querySelector<HTMLElement>(".js-plotly-plot");
    if (!el) throw new Error("Kein Plot zum Exportieren vorhanden.");
    // Loaded lazily: the Plotly bundle is large and only needed here.
    const { Plotly } = await import("../../app/components/plot/plotlyBundle");
    const dataUrl = await Plotly.toImage(el as never, {
      format: "png",
      width: el.clientWidth || 1200,
      height: el.clientHeight || 600,
      scale: 2,
    });
    return dataUrlToBlob(dataUrl);
  },
};
