import { useCallback, useState } from "react";
import type { Range } from "./plotGeometry";

export type CursorPair = [number, number];

/**
 * State of the two vertical measurement cursors.
 * Positions are in data coordinates, so they stay on the signal while the user
 * zooms or new live frames arrive.
 * @returns Toggle state, positions (null until first enabled) and setters
 */
export function useCursors() {
  const [enabled, setEnabled] = useState(false);
  const [positions, setPositions] = useState<CursorPair | null>(null);

  const toggle = useCallback((visible: Range) => {
    setEnabled((on) => !on);
    setPositions((p) => {
      if (p) return p;
      const span = visible[1] - visible[0];
      return [visible[0] + span * 0.3, visible[0] + span * 0.7];
    });
  }, []);

  const move = useCallback((index: 0 | 1, x: number) => {
    setPositions((p) => (p ? (index === 0 ? [x, p[1]] : [p[0], x]) : p));
  }, []);

  return { enabled, positions, toggle, move };
}
