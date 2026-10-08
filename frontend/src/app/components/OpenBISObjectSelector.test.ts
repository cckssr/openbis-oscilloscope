import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, resolveSelection } from "./OpenBISObjectSelector";

const projects = [{ code: "P1", display_name: "Mittwoch", group_name: "G4", semester: "WS26" }];
const collections = {
  key: "P1",
  items: [{ code: "E1", display_name: "RC-Glied", identifier: "/LAB/P1/E1" }],
};
const objects = {
  key: "E1",
  items: [{ code: "O1", type: "PROBE", identifier: "/LAB/O1" }],
};
const remembered = {
  ...EMPTY_SELECTION,
  projectCode: "P1",
  collectionCode: "E1",
  objectIdentifier: "/LAB/O1",
};

describe("resolveSelection", () => {
  it("resolves all three levels in one pass", () => {
    const r = resolveSelection(remembered, projects, collections, objects);
    expect(r).toMatchObject({
      projectLabel: "Mittwoch",
      groupName: "G4",
      semester: "WS26",
      collectionLabel: "RC-Glied",
      collectionIdentifier: "/LAB/P1/E1",
      objectLabel: "O1 (PROBE)",
      objectIdentifier: "/LAB/O1",
    });
  });

  it("is stable once resolved (returns the same object, so no effect loop)", () => {
    const r = resolveSelection(remembered, projects, collections, objects);
    expect(resolveSelection(r, projects, collections, objects)).toBe(r);
  });

  it("waits while lists are loading", () => {
    expect(resolveSelection(remembered, null, null, null)).toBe(remembered);
    const half = resolveSelection(remembered, projects, null, null);
    expect(half.projectLabel).toBe("Mittwoch");
    expect(half.collectionIdentifier).toBe("");
  });

  it("drops remembered entries that no longer exist", () => {
    expect(resolveSelection(remembered, [], null, null)).toBe(EMPTY_SELECTION);
    const noCollection = resolveSelection(remembered, projects, { key: "P1", items: [] }, null);
    expect(noCollection).toMatchObject({ projectCode: "P1", collectionCode: "", objectIdentifier: "" });
    const noObject = resolveSelection(remembered, projects, collections, { key: "E1", items: [] });
    expect(noObject).toMatchObject({ collectionIdentifier: "/LAB/P1/E1", objectIdentifier: "" });
  });

  it("ignores lists that belong to another parent", () => {
    const r = resolveSelection(remembered, projects, { ...collections, key: "OTHER" }, null);
    expect(r.collectionIdentifier).toBe("");
  });
});
