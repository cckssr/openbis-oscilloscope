import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DeviceCard } from "./DeviceCard";
import type { Device } from "../../api/types";

afterEach(cleanup);

const base: Device = {
  id: "scope-01",
  label: "Rigol 1",
  ip: "10.0.0.1",
  port: 5025,
  state: "ONLINE",
  last_error: null,
  lock: null,
};
const button = () => screen.getByRole("button") as HTMLButtonElement;

describe("DeviceCard", () => {
  it("offers 'Öffnen' for a free device", () => {
    const onOpen = vi.fn();
    render(<DeviceCard device={base} onOpen={onOpen} />);
    expect(button().textContent).toBe("Öffnen");
    fireEvent.click(button());
    expect(onOpen).toHaveBeenCalledWith(base);
  });

  it("offers 'Fortsetzen' for the user's own lock", () => {
    const device: Device = {
      ...base,
      state: "LOCKED",
      lock: { owner_user: "me", acquired_at: 1, is_mine: true },
    };
    render(<DeviceCard device={device} onOpen={() => {}} />);
    expect(button().textContent).toBe("Fortsetzen");
    expect(button().disabled).toBe(false);
    expect(screen.getByText("Du steuerst")).toBeTruthy();
  });

  it("disables 'Belegt' and names the owner when someone else holds the lock", () => {
    const device: Device = {
      ...base,
      state: "LOCKED",
      lock: { owner_user: "anna", acquired_at: 1_700_000_000, is_mine: false },
    };
    render(<DeviceCard device={device} onOpen={() => {}} />);
    expect(button().textContent).toBe("Belegt");
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/Belegt von anna seit/)).toBeTruthy();
  });

  it("shows last_error and the supervisor hint for ERROR devices", () => {
    render(
      <DeviceCard device={{ ...base, state: "ERROR", last_error: "VISA timeout" }} onOpen={() => {}} />,
    );
    expect(button().disabled).toBe(true);
    expect(screen.getByText("VISA timeout")).toBeTruthy();
    expect(screen.getAllByText("Bitte Betreuer:in informieren.").length).toBeGreaterThan(0);
  });
});
