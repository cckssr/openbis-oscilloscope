import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Workflow } from "../../../state/deviceSession";

const workflow: Workflow = {
  steps: [
    { id: "take", label: "Gerät übernehmen", state: "done" },
    { id: "setup", label: "Signal einstellen", state: "active", optional: true },
    { id: "capture", label: "Aufnehmen", state: "todo" },
    { id: "annotate", label: "Notieren & auswählen", state: "blocked" },
    { id: "upload", label: "Hochladen", state: "todo" },
  ],
  next: "Drücke „Live starten“, um das Signal zu sehen.",
};

vi.mock("./useWorkflow", () => ({ useWorkflow: () => workflow }));
vi.mock("../header/model", () => ({
  useHeaderModel: () => ({ archiveSessionId: "sess-1" }),
  archivePath: (id?: string) => (id ? `/archive/${id}` : "/sessions"),
}));

import { WorkflowStepper } from "./WorkflowStepper";

afterEach(cleanup);

const renderStepper = (compact = false) =>
  render(
    <MemoryRouter>
      <WorkflowStepper deviceId="scope-01" compact={compact} />
    </MemoryRouter>,
  );

describe("WorkflowStepper", () => {
  it("renders five steps with state text for screen readers, not colour only", () => {
    renderStepper();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.getAttribute("data-state"))).toEqual(["done", "active", "todo", "blocked", "todo"]);
    expect(screen.getByText("Gerät übernehmen: erledigt")).toBeTruthy();
    expect(screen.getByText("Notieren & auswählen: noch nicht möglich")).toBeTruthy();
    expect(items[1].getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("(optional)")).toBeTruthy();
  });

  it("shows the 'Als Nächstes' hint under the steps", () => {
    renderStepper();
    expect(screen.getByTestId("next-hint").textContent).toContain("Als Nächstes");
    expect(screen.getByTestId("next-hint").textContent).toContain("Drücke „Live starten“");
  });

  it("links step ⑤ to the archive of the session", () => {
    renderStepper();
    const link = screen.getByRole("link", { name: /Hochladen/ });
    expect(link.getAttribute("href")).toBe("/archive/sess-1");
  });

  it("compact mode keeps only the active step's label visible", () => {
    renderStepper(true);
    // visible (aria-hidden) label texts: only the active step
    const visible = [...document.querySelectorAll("li [aria-hidden=true]")]
      .map((n) => n.textContent)
      .filter((t) => t && /[A-Za-zäöü]{4,}/.test(t));
    expect(visible).toContain("Signal einstellen");
    expect(visible).not.toContain("Aufnehmen");
  });

  it("compact mode drops the '(optional)' suffix and renders the trailing control", () => {
    render(
      <MemoryRouter>
        <WorkflowStepper deviceId="scope-01" compact trailing={<button>Ebene</button>} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("(optional)")).toBeNull();
    expect(screen.getByRole("button", { name: "Ebene" })).toBeTruthy();
    expect(screen.getByRole("navigation").contains(screen.getByRole("button", { name: "Ebene" }))).toBe(false);
  });
});
