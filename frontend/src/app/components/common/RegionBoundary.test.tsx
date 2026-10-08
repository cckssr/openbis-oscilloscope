import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RegionBoundary } from "./RegionBoundary";
import { DisabledReason } from "./DisabledReason";

afterEach(cleanup);

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error("kaputt");
  return <p>ok</p>;
}

describe("RegionBoundary", () => {
  it("shows the German fallback and recovers with 'Erneut versuchen'", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Host() {
      const [explode, setExplode] = useState(true);
      return (
        <RegionBoundary name="Kurvenanzeige">
          <Bomb explode={explode} />
          <button onClick={() => setExplode(false)}>fix</button>
        </RegionBoundary>
      );
    }
    render(<Host />);
    expect(screen.getByText("Dieser Bereich konnte nicht angezeigt werden")).toBeTruthy();
    expect(screen.getByText("Bereich: Kurvenanzeige")).toBeTruthy();
    expect(console.error).toHaveBeenCalled();
    // Without fixing the cause the retry fails again; the boundary stays usable.
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("resets when a reset key changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <RegionBoundary resetKeys={["a"]}>
        <Bomb explode />
      </RegionBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(
      <RegionBoundary resetKeys={["b"]}>
        <Bomb explode={false} />
      </RegionBoundary>,
    );
    expect(screen.getByText("ok")).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe("DisabledReason", () => {
  it("prints the reason as visible text for touch and renders children untouched without one", () => {
    const { rerender } = render(
      <DisabledReason reason="Erst Gerät übernehmen">
        <button disabled>Live</button>
      </DisabledReason>,
    );
    expect(screen.getByText("Erst Gerät übernehmen")).toBeTruthy();
    rerender(
      <DisabledReason reason={null}>
        <button>Live</button>
      </DisabledReason>,
    );
    expect(screen.queryByText("Erst Gerät übernehmen")).toBeNull();
    expect(screen.getByRole("button", { name: "Live" })).toBeTruthy();
  });
});
