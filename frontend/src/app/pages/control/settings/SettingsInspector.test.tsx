import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { makeSnapshot } from "../../../controls/testing";
import type { InspectorModel } from "../../../controls/store";
import type { SettingPath } from "../../../state/deviceSession/types";
import { SettingsInspector } from "./SettingsInspector";

const fake = vi.hoisted(() => ({
  model: null as unknown,
  set: vi.fn(),
}));

vi.mock("../../../controls/store", () => ({
  useInspectorModel: () => fake.model,
  useSetting: (_deviceId: string, path: SettingPath) => {
    const model = fake.model as InspectorModel;
    const [group, a, b] = path.split(".");
    const settings = model.settings as unknown as Record<
      string,
      Record<string, unknown>
    >;
    const value =
      group === "channels"
        ? (
            model.settings!.channels[Number(a)] as unknown as Record<
              string,
              unknown
            >
          )[b]
        : settings[group][a];
    return { value, applied: value, status: undefined, set: fake.set };
  },
}));

const model = (
  channelCount = 4,
  overrides: Partial<InspectorModel> = {},
): InspectorModel => ({
  capabilities: [],
  channelCount,
  settings: makeSnapshot(channelCount),
  loading: false,
  ...overrides,
});

const renderInspector = (
  props: Partial<React.ComponentProps<typeof SettingsInspector>> = {},
) =>
  render(
    <SettingsInspector deviceId="scope-01" level="expert" canEdit {...props} />,
  );

beforeEach(() => {
  fake.model = model();
  fake.set.mockReset();
});
afterEach(cleanup);

describe("SettingsInspector", () => {
  it("shows a tab per group in expert level", () => {
    renderInspector();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Kanäle",
      "Zeitbasis",
      "Trigger",
    ]);
  });

  it("expands enabled channels and collapses disabled ones", () => {
    renderInspector();
    const ch1 = document.querySelector('[data-channel="1"]')!;
    const ch2 = document.querySelector('[data-channel="2"]')!;
    expect(ch1.getAttribute("data-state")).toBe("open");
    expect(ch2.getAttribute("data-state")).toBe("closed");
    expect(
      within(ch1 as HTMLElement).getByText("CH1 · 200 mV/div · DC · 1×"),
    ).toBeTruthy();
    expect(within(ch2 as HTMLElement).getByText("CH2 · aus")).toBeTruthy();
  });

  it("lets the user toggle a channel from its header", () => {
    renderInspector();
    const ch2 = document.querySelector('[data-channel="2"]') as HTMLElement;
    fireEvent.click(within(ch2).getByRole("switch"));
    expect(fake.set).toHaveBeenCalledWith(true);
  });

  it("shows only compact on/off rows in basic level", () => {
    renderInspector({ level: "basic" });
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    expect(screen.queryByText("Vertikale Skalierung")).toBeNull();
  });

  it("follows the channel count", () => {
    fake.model = model(2);
    renderInspector({ level: "basic" });
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("renders groups as an accordion in narrow sheets", () => {
    renderInspector({ layout: "accordion" });
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByText("1 ms/div · Versatz 0 s")).toBeTruthy();
  });

  it("shows a skeleton while settings load", () => {
    fake.model = model(4, { settings: null, loading: true });
    renderInspector();
    expect(screen.getByText("Einstellungen werden geladen…")).toBeTruthy();
  });

  describe("without control of the device", () => {
    it("disables all controls and explains why", () => {
      renderInspector({ canEdit: false });
      expect(
        screen.getByText("Gerät übernehmen, um Einstellungen zu ändern"),
      ).toBeTruthy();
      screen
        .getAllByRole("switch")
        .forEach((s) => expect((s as HTMLButtonElement).disabled).toBe(true));
      screen
        .getAllByRole("textbox")
        .forEach((i) => expect((i as HTMLInputElement).disabled).toBe(true));
    });

    it("offers to take the device", () => {
      const onTakeControl = vi.fn();
      renderInspector({ canEdit: false, onTakeControl });
      fireEvent.click(screen.getByRole("button", { name: "Gerät übernehmen" }));
      expect(onTakeControl).toHaveBeenCalledOnce();
    });

    it("shows a custom reason and no button without onTakeControl", () => {
      renderInspector({
        canEdit: false,
        readOnlyReason: "Gerät ist in einem anderen Tab geöffnet.",
      });
      expect(
        screen.getByText("Gerät ist in einem anderen Tab geöffnet."),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Gerät übernehmen" }),
      ).toBeNull();
    });

    it("shows no banner when editing is allowed", () => {
      renderInspector();
      expect(
        screen.queryByText("Gerät übernehmen, um Einstellungen zu ändern"),
      ).toBeNull();
    });
  });
});
