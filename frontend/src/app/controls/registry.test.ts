import { afterEach, describe, expect, it } from "vitest";
import { Activity } from "lucide-react";
import { getControlGroups, registerControlGroup } from "./index";
import { channelSummary } from "./groups/channels";
import { resolve } from "./paths";
import { makeContext } from "./testing";
import type {
  ControlGroupDef,
  EnumControlDef,
  NumberControlDef,
} from "./types";

const ids = (
  level: "basic" | "expert",
  capabilities: string[] = [],
  channelCount = 4,
) => getControlGroups({ level, capabilities, channelCount }).map((g) => g.id);

describe("getControlGroups", () => {
  it("shows only the channel group with only the on/off toggle in basic level", () => {
    const groups = getControlGroups({
      level: "basic",
      capabilities: [],
      channelCount: 4,
    });
    expect(groups.map((g) => g.id)).toEqual(["channels"]);
    expect(groups[0].controls.map((c) => c.key)).toEqual(["enabled"]);
  });

  it("shows all built-in groups and controls in expert level", () => {
    const groups = getControlGroups({
      level: "expert",
      capabilities: [],
      channelCount: 4,
    });
    expect(groups.map((g) => g.id)).toEqual([
      "channels",
      "timebase",
      "trigger",
    ]);
    expect(groups[0].controls.map((c) => c.key)).toEqual([
      "enabled",
      "scale_v_div",
      "offset_v",
      "coupling",
      "probe_attenuation",
    ]);
  });

  describe("custom groups", () => {
    const cleanup: Array<() => void> = [];
    afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
    const register = (def: Partial<ControlGroupDef> & { id: string }) =>
      cleanup.push(
        registerControlGroup({
          label: def.id,
          icon: Activity,
          level: "expert",
          controls: [{ kind: "toggle", key: "x", label: "X", level: "expert" }],
          ...def,
        }),
      );

    it("hides groups whose capability the scope lacks", () => {
      register({ id: "acquire", requires: "single" });
      expect(ids("expert")).not.toContain("acquire");
      expect(ids("expert", ["single"])).toContain("acquire");
    });

    it("hides per-channel groups for a scope without channels", () => {
      register({ id: "per", perChannel: true });
      expect(ids("expert", [], 0)).not.toContain("per");
      expect(ids("expert", [], 2)).toContain("per");
    });

    it("drops groups without any control visible at the level", () => {
      register({ id: "adv", level: "basic" });
      expect(ids("basic")).not.toContain("adv");
      expect(ids("expert")).toContain("adv");
    });

    it("replaces a group registered twice and keeps its position", () => {
      register({ id: "dup", label: "A" });
      register({ id: "dup", label: "B" });
      const found = getControlGroups({
        level: "expert",
        capabilities: [],
        channelCount: 1,
      }).filter((g) => g.id === "dup");
      expect(found.map((g) => g.label)).toEqual(["B"]);
    });
  });
});

describe("summaries", () => {
  it("formats an enabled channel", () => {
    expect(channelSummary(makeContext(4, 1))).toBe(
      "CH1 · 200 mV/div · DC · 1×",
    );
  });

  it("formats a disabled channel", () => {
    expect(channelSummary(makeContext(4, 2))).toBe("CH2 · aus");
  });

  it("counts enabled channels without a channel", () => {
    expect(channelSummary(makeContext(4))).toBe("1 von 4 an");
  });

  it("summarises timebase and trigger groups", () => {
    const groups = getControlGroups({
      level: "expert",
      capabilities: [],
      channelCount: 4,
    });
    const ctx = makeContext();
    expect(groups.find((g) => g.id === "timebase")?.summary?.(ctx)).toBe(
      "1 ms/div · Versatz 0 s",
    );
    expect(groups.find((g) => g.id === "trigger")?.summary?.(ctx)).toBe(
      "Auto · CH1 · ↑ · 0 V",
    );
  });
});

describe("context dependent definitions", () => {
  const groups = getControlGroups({
    level: "expert",
    capabilities: [],
    channelCount: 4,
  });
  const control = <T>(group: string, key: string) =>
    groups
      .find((g) => g.id === group)!
      .controls.find((c) => c.key === key) as T;

  it("steps the channel offset in tenths of V/div", () => {
    const def = control<NumberControlDef>("channels", "offset_v");
    expect(resolve(def.step!, makeContext(4, 1))).toBeCloseTo(0.02);
  });

  it("steps the trigger level by the V/div of the trigger source", () => {
    const def = control<NumberControlDef>("trigger", "level_v");
    const ctx = makeContext(4);
    ctx.settings.channels[2].scale_v_div = 2;
    expect(resolve(def.step!, ctx)).toBeCloseTo(0.02);
    ctx.settings.trigger.source = "CH2";
    expect(resolve(def.step!, ctx)).toBeCloseTo(0.2);
  });

  it("steps the time offset in tenths of s/div", () => {
    const def = control<NumberControlDef>("timebase", "offset_s");
    expect(resolve(def.step!, makeContext())).toBeCloseTo(1e-4);
  });

  it("offers one trigger source per channel", () => {
    const def = control<EnumControlDef>("trigger", "source");
    const labels = (n: number) =>
      resolve(def.options, makeContext(n)).map((o) => o.label);
    expect(labels(2)).toEqual(["CH1", "CH2"]);
    expect(labels(4)).toEqual(["CH1", "CH2", "CH3", "CH4"]);
  });

  it("hides channel details while the channel is off", () => {
    const def = control<NumberControlDef>("channels", "scale_v_div");
    expect(def.visible?.(makeContext(4, 1))).toBe(true);
    expect(def.visible?.(makeContext(4, 2))).toBe(false);
  });
});
