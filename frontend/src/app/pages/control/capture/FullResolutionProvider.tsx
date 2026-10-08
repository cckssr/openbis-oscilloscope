import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FullResolutionDialog } from "./FullResolutionDialog";

/** What components get to control the one full-resolution dialog. */
export interface FullResolutionControl {
  /** Opens the dialog (menu entry, "F" shortcut). */
  open: () => void;
}

const FullResolutionContext = createContext<FullResolutionControl | null>(null);

/**
 * Owns the single {@link FullResolutionDialog} of the control page and its
 * open state, so the capture menu and the "F" shortcut open the same instance
 * instead of each mounting their own.
 *
 * @param props.deviceId - The device the dialog reads from
 * @param props.children - The page; descendants call {@link useFullResolutionDialog}
 * @returns The provider with the dialog mounted next to the children
 */
export function FullResolutionProvider({ deviceId, children }: { deviceId: string; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const control = useMemo(() => ({ open }), [open]);
  return (
    <FullResolutionContext.Provider value={control}>
      {children}
      <FullResolutionDialog deviceId={deviceId} open={isOpen} onOpenChange={setOpen} />
    </FullResolutionContext.Provider>
  );
}

/**
 * Handle to the page's full-resolution dialog.
 *
 * @returns `{ open }`
 * @throws When used outside a {@link FullResolutionProvider}
 */
export function useFullResolutionDialog(): FullResolutionControl {
  const control = useContext(FullResolutionContext);
  if (!control) throw new Error("useFullResolutionDialog needs a <FullResolutionProvider>");
  return control;
}
