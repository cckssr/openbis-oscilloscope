import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { FullResolutionDialog } from "./FullResolutionDialog";
import { estimateReadSeconds } from "./estimate";
import {
  FakeSession,
  heldState,
  makeCapture,
  makeJob,
} from "../actions/testing";
import type { SettingsSnapshot } from "../../../state/deviceSession/types";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSession }));
vi.mock("../actions/session", (orig) =>
  import("../actions/testing").then((m) => m.sessionMock(orig, () => h.fake)),
);

const settings = (): SettingsSnapshot => {
  const ch = (enabled: boolean) => ({
    enabled,
    scale_v_div: 1,
    offset_v: 0,
    coupling: "DC" as const,
    probe_attenuation: 1,
  });
  return {
    channels: { 1: ch(true), 2: ch(true), 3: ch(false), 4: ch(false) },
    timebase: { scale_s_div: 1e-3, offset_s: 0, sample_rate: 1e6 },
    trigger: { source: "CH1", level_v: 0, slope: "RISE", mode: "AUTO" },
  };
};

const baseState = () =>
  heldState({
    memoryDepth: 1_200_000,
    settings: {
      applied: settings(),
      pending: {},
      status: {},
      loading: false,
      touched: true,
    },
  });

const onOpenChange = vi.fn();
const renderDialog = () =>
  render(
    <FullResolutionDialog
      deviceId="scope-01"
      open
      onOpenChange={onOpenChange}
    />,
  );
const active = () =>
  document.querySelector('[data-state="active"]') as HTMLElement;

beforeEach(() => {
  h.fake = new FakeSession(baseState());
  onOpenChange.mockReset();
});
afterEach(cleanup);

describe("estimateReadSeconds", () => {
  it("returns a range that grows with depth and channels", () => {
    const small = estimateReadSeconds(12_000, 1)!;
    const large = estimateReadSeconds(1_200_000, 2)!;
    expect(small[0]).toBeLessThan(small[1]);
    expect(large[1]).toBeGreaterThan(small[1]);
  });
  it("is null for an unknown depth", () => {
    expect(estimateReadSeconds(null, 2)).toBeNull();
  });
});

describe("FullResolutionDialog", () => {
  it("starts with the explanation (step 1)", () => {
    renderDialog();
    expect(active().getAttribute("data-testid")).toBe("fr-step-1");
    expect(screen.getByText(/liest seinen gesamten Speicher aus/)).toBeTruthy();
    expect(h.fake.actions.saveFullResolution).not.toHaveBeenCalled();
  });

  it("step 2 shows depth, channels, a duration range and the front-panel hint", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(active().getAttribute("data-testid")).toBe("fr-step-2");
    expect(screen.getByTestId("fr-depth").textContent).toMatch(/1,2 MPkt/);
    expect(screen.getByText("CH1")).toBeTruthy();
    expect(screen.getByText("CH2")).toBeTruthy();
    expect(screen.getByTestId("fr-estimate").textContent).toMatch(
      /^etwa .+ bis .+/,
    );
    expect(screen.getByText(/Acquire → Mem Depth/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
    expect(active().getAttribute("data-testid")).toBe("fr-step-1");
  });

  it("walks through reading with progress and ends with the result", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Lesen starten" }));
    expect(h.fake.actions.saveFullResolution).toHaveBeenCalledTimes(1);
    expect(active().getAttribute("data-testid")).toBe("fr-step-3");
    expect(screen.getByText("Das Gerät bereitet das Lesen vor…")).toBeTruthy();

    const job = makeJob({
      startedAt: Date.now() + 1,
      progress: 0.4,
      detail: "Kanal 1 von 2",
    });
    act(() => h.fake.set({ jobs: [job], busy: job.label }));
    expect(
      screen.getByTestId("fr-progress").getAttribute("data-determinate"),
    ).toBe("true");
    expect(screen.getByText("40 %")).toBeTruthy();
    expect(screen.getByText("Kanal 1 von 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(h.fake.actions.cancelFullResolution).toHaveBeenCalledTimes(1);

    act(() =>
      h.fake.set({
        jobs: [{ ...job, status: "done", cancellable: false, progress: 1 }],
        busy: null,
        lastCapture: makeCapture({ fullResolution: true, number: 7 }),
      }),
    );
    expect(active().getAttribute("data-testid")).toBe("fr-step-4");
    expect(screen.getByTestId("fr-result").getAttribute("data-kind")).toBe(
      "done",
    );
    expect(screen.getByText(/Gespeichert als Aufnahme #7/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Im Plot anzeigen" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses an indeterminate bar with elapsed time when no progress is reported", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Lesen starten" }));
    act(() => h.fake.set({ jobs: [makeJob({ startedAt: Date.now() + 1 })] }));
    expect(
      screen.getByTestId("fr-progress").getAttribute("data-determinate"),
    ).toBe("false");
    expect(screen.getByText(/Vergangene Zeit:/)).toBeTruthy();
  });

  it("shows 'Abgebrochen' and offers a retry", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Lesen starten" }));
    act(() =>
      h.fake.set({
        jobs: [
          makeJob({
            startedAt: Date.now() + 1,
            status: "cancelled",
            cancellable: false,
          }),
        ],
      }),
    );
    expect(screen.getByTestId("fr-result").getAttribute("data-kind")).toBe(
      "cancelled",
    );
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(h.fake.actions.saveFullResolution).toHaveBeenCalledTimes(2);
  });

  it("shows the error of a failed read", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Lesen starten" }));
    act(() =>
      h.fake.set({
        jobs: [
          makeJob({
            startedAt: Date.now() + 1,
            status: "error",
            error: "Zeitüberschreitung",
            cancellable: false,
          }),
        ],
      }),
    );
    expect(screen.getByTestId("fr-result").getAttribute("data-kind")).toBe(
      "error",
    );
    expect(screen.getByText("Zeitüberschreitung")).toBeTruthy();
  });

  it("can be closed while reading without cancelling; reopening shows the progress", () => {
    const job = makeJob({ progress: 0.2 });
    h.fake = new FakeSession({ ...baseState(), jobs: [job], busy: job.label });
    renderDialog();
    expect(active().getAttribute("data-testid")).toBe("fr-step-3");
    fireEvent.click(screen.getAllByRole("button", { name: "Schließen" })[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(h.fake.actions.cancelFullResolution).not.toHaveBeenCalled();
  });

  it("blocks 'Lesen starten' while another command runs", () => {
    h.fake = new FakeSession({
      ...baseState(),
      busy: "Einstellung wird übernommen…",
    });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Lesen starten",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
