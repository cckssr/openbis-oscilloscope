import { describe, expect, it } from "vitest";
import { eodMinutesLeft } from "./eodWarning";

describe("eodMinutesLeft", () => {
  const reset = "23:59";
  const zone = "Europe/Berlin";
  // 2026-10-07 is CEST (UTC+2): 21:49 UTC = 23:49 local.
  const at = (utc: string) => new Date(`2026-10-07T${utc}:00Z`);

  it("is silent more than 10 minutes before the reset", () => {
    expect(eodMinutesLeft(at("21:48"), reset, zone)).toBeNull();
    expect(eodMinutesLeft(at("12:00"), reset, zone)).toBeNull();
  });

  it("warns from 10 minutes before the reset", () => {
    expect(eodMinutesLeft(at("21:49"), reset, zone)).toBe(10);
    expect(eodMinutesLeft(at("21:55"), reset, zone)).toBe(4);
    expect(eodMinutesLeft(at("21:59"), reset, zone)).toBe(0);
  });

  it("stops after the reset", () => {
    expect(eodMinutesLeft(at("22:00"), reset, zone)).toBeNull();
    expect(eodMinutesLeft(at("22:05"), reset, zone)).toBeNull();
  });

  it("uses the configured time zone, not the browser's", () => {
    // 21:55 UTC is 23:55 in Berlin but 21:55 in UTC.
    expect(eodMinutesLeft(at("21:55"), reset, "UTC")).toBeNull();
    expect(eodMinutesLeft(at("23:55"), reset, "UTC")).toBe(4);
  });

  it("handles a reset shortly after midnight", () => {
    expect(eodMinutesLeft(new Date("2026-10-07T23:55:00Z"), "00:05", "UTC")).toBe(10);
  });

  it("ignores malformed config", () => {
    expect(eodMinutesLeft(at("21:55"), "soon", zone)).toBeNull();
    expect(eodMinutesLeft(at("21:55"), reset, "Not/AZone")).toBeNull();
  });
});
