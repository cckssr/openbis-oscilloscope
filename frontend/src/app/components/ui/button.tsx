import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

/**
 * Lab button. Use exactly one `primary` per region; `danger` only for
 * destructive actions. Disabled buttons use explicit colours (not opacity) to
 * keep ≥ 3:1 contrast. Sizes grow to ≥ 40 px on touch (`pointer: coarse`).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded border-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-(--lab-accent)/40 disabled:cursor-not-allowed disabled:border-(--lab-border) disabled:bg-(--lab-disabled-bg) disabled:text-(--lab-disabled-text) [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-(--lab-accent) bg-(--lab-accent) text-white hover:bg-(--lab-accent-hover) hover:border-(--lab-accent-hover)",
        secondary:
          "border-(--lab-border) bg-white text-(--lab-text-primary) hover:bg-(--lab-panel)",
        outline:
          "border-(--lab-accent) bg-white text-(--lab-accent) hover:bg-(--lab-accent) hover:text-white",
        success:
          "border-(--lab-success) bg-(--lab-success) text-white hover:brightness-95",
        danger:
          "border-(--lab-danger) bg-white text-(--lab-danger) hover:bg-(--lab-danger) hover:text-white",
        ghost:
          "border-transparent bg-transparent text-(--lab-text-secondary) hover:bg-(--lab-panel) hover:text-(--lab-text-primary) disabled:bg-transparent disabled:border-transparent",
        link: "border-transparent bg-transparent px-0 text-(--lab-accent) underline-offset-4 hover:underline disabled:bg-transparent disabled:border-transparent",
      },
      size: {
        default: "h-9 px-4 coarse:h-11",
        sm: "h-8 gap-1.5 px-3 text-xs coarse:h-10",
        lg: "h-11 px-6 text-base coarse:h-12",
        icon: "size-9 coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
