import { Toaster as Sonner, type ToasterProps } from "sonner";

/** App-wide toast host; styled with the lab theme tokens. */
const Toaster = (props: ToasterProps) => (
  <Sonner
    className="toaster group"
    position="bottom-right"
    richColors
    closeButton
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
      } as React.CSSProperties
    }
    {...props}
  />
);

export { Toaster };
