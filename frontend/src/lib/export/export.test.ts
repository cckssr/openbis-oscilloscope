import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { Trace } from "../trace";
import { csvParts } from "./csv";
import { listExporters } from "./index";
import { buildNpz } from "./npz";
import { toNpy } from "./npy";

function trace(id: string, y: number[], x = [0, 1e-6, 2e-6]): Trace {
  return {
    id,
    kind: "channel",
    label: id,
    color: "#000",
    x: Float64Array.from(x),
    y: Float64Array.from(y),
    xUnit: "s",
    yUnit: "V",
  };
}

describe("csv", () => {
  it("writes time_s plus one column per channel at full resolution", () => {
    const csv = csvParts([trace("CH1", [0.1, 0.2, 0.3]), trace("CH2", [1, 2, 3])]).join("");
    expect(csv.split("\n")).toEqual([
      "time_s,CH1_V,CH2_V",
      "0,0.1,1",
      "0.000001,0.2,2",
      "0.000002,0.3,3",
      "",
    ]);
  });

  it("interpolates traces sampled on a different axis", () => {
    const a = trace("CH1", [0, 2, 4], [0, 1, 2]);
    const b = trace("CH2", [0, 4], [0, 2]);
    const rows = csvParts([a, b]).join("").trim().split("\n");
    expect(rows[2]).toBe("1,2,2");
  });
});

describe("npy", () => {
  it("writes a version 1.0 header with 64-byte alignment", () => {
    const bytes = toNpy(Float64Array.from([1, 2, 3]));
    expect(Array.from(bytes.slice(0, 6))).toEqual([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);
    expect([bytes[6], bytes[7]]).toEqual([1, 0]);
    const view = new DataView(bytes.buffer);
    const headerLen = view.getUint16(8, true);
    expect((10 + headerLen) % 64).toBe(0);
    const header = new TextDecoder().decode(bytes.slice(10, 10 + headerLen));
    expect(header).toContain("'descr': '<f8'");
    expect(header).toContain("'fortran_order': False");
    expect(header).toContain("'shape': (3,)");
    expect(header.endsWith("\n")).toBe(true);
    expect(bytes.length).toBe(10 + headerLen + 24);
    expect(view.getFloat64(10 + headerLen + 8, true)).toBe(2);
  });
});

describe("npz", () => {
  it("contains time_s and one npy per trace", async () => {
    const blob = await buildNpz({
      baseName: "x",
      traces: [trace("CH1", [1, 2, 3]), trace("CH2", [4, 5, 6])],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(["CH1.npy", "CH2.npy", "time_s.npy"]);
  });
});

describe("registry", () => {
  it("offers only applicable exporters", () => {
    const ids = (i: Parameters<typeof listExporters>[0]) => listExporters(i).map((e) => e.id);
    expect(ids({ baseName: "x" })).toEqual([]);
    expect(ids({ baseName: "x", traces: [trace("CH1", [1, 2, 3])] })).toEqual(["csv", "npz"]);
    expect(
      ids({ baseName: "x", token: "t", sessionId: "s", artifactIds: ["a"] }),
    ).toEqual(["hdf5", "zip"]);
  });
});
