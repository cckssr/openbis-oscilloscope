import { EnumControl } from "./EnumControl";
import { NumberControl } from "./NumberControl";
import { ToggleControl } from "./ToggleControl";
import type { ControlDef } from "../types";
import type { ControlProps } from "./types";

/**
 * Picks the renderer for a control definition by its `kind`.
 *
 * @param props - Props of any renderer; `def.kind` decides which one is used
 * @returns The rendered control
 */
export function ControlRenderer(props: ControlProps<ControlDef>) {
  const { def } = props;
  switch (def.kind) {
    case "number":
      return <NumberControl {...props} def={def} />;
    case "enum":
      return <EnumControl {...props} def={def} />;
    case "toggle":
      return <ToggleControl {...props} def={def} />;
  }
}
