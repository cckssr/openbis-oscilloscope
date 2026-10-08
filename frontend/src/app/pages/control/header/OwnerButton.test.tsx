import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { HeaderModel } from "./model";

const actions = { release: vi.fn(async () => {}), takeControl: vi.fn(async () => {}) };
vi.mock("../actions/session", () => ({ useDeviceActions: () => actions }));

import { OwnerButton } from "./OwnerButton";

const device = {
  id: "scope-01",
  label: "Scope",
  ip: "",
  port: 1,
  state: "ONLINE",
  last_error: null,
  lock: null,
  capabilities: [],
  channel_count: 4,
} as const;

const model = (over: Partial<HeaderModel> = {}): HeaderModel => ({
  device: device as unknown as HeaderModel["device"],
  lockStatus: "held",
  archiveSessionId: "sess-1",
  total: 3,
  notUploaded: 0,
  busy: null,
  ...over,
});

const renderButton = (m: HeaderModel) =>
  render(
    <MemoryRouter initialEntries={["/device/scope-01"]}>
      <Routes>
        <Route path="/device/:id" element={<OwnerButton deviceId="scope-01" model={m} />} />
        <Route path="/archive/:id" element={<p>ARCHIV</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("OwnerButton", () => {
  it("offers 'Gerät übernehmen' as primary action when not in control", () => {
    renderButton(model({ lockStatus: "none" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerät übernehmen" }));
    expect(actions.takeControl).toHaveBeenCalledOnce();
  });

  it("releases immediately when everything is uploaded", () => {
    renderButton(model({ notUploaded: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "Gerät freigeben" }));
    expect(actions.release).toHaveBeenCalledOnce();
  });

  it("asks first when captures are not uploaded; 'Trotzdem freigeben' releases", () => {
    renderButton(model({ notUploaded: 3 }));
    fireEvent.click(screen.getByRole("button", { name: "Gerät freigeben" }));
    expect(actions.release).not.toHaveBeenCalled();
    expect(screen.getByText("3 Aufnahmen sind noch nicht hochgeladen.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trotzdem freigeben" }));
    expect(actions.release).toHaveBeenCalledOnce();
  });

  it("'Jetzt hochladen' goes to the archive without releasing", () => {
    renderButton(model({ notUploaded: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Gerät freigeben" }));
    expect(screen.getByText("1 Aufnahme ist noch nicht hochgeladen.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Jetzt hochladen" }));
    expect(actions.release).not.toHaveBeenCalled();
    expect(screen.getByText("ARCHIV")).toBeTruthy();
  });

  it("'Abbrechen' keeps control", () => {
    renderButton(model({ notUploaded: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Gerät freigeben" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(actions.release).not.toHaveBeenCalled();
  });
});
