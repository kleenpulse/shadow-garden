"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Rewritten without `class-variance-authority` and `@radix-ui/react-slot`. Both
// were doing a small job — a lookup table and a clone — and neither is worth a
// package on the install line of a template.
//
// The variants that referenced tokens this project never really used
// (`outline`, `ghost`, `secondary`, `link`) are gone too. Two of them had also been
// mangled by a bad automated rewrite into a nested arbitrary value — an accent
// token wrapping a foreground token wrapping another hsl() — which is a fair sign
// nobody was looking at them.
//
// That mangled string is described here rather than quoted, deliberately: Tailwind
// scans raw source text for class candidates and does not care that it is inside a
// comment. Quoting it made Tailwind emit the broken rule, which failed to parse and
// took the whole stylesheet down with it.

const BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:opacity-80 active:scale-95";

const VARIANTS = {
  default: "bg-[hsl(var(--primary-red))] text-[hsl(var(--primary-foreground))]",
  icon: "bg-transparent",
  transparent:
    "bg-transparent hover:bg-transparent hover:text-[hsl(var(--primary-red))]",
} as const;

const SIZES = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  className?: string;
} = {}): string {
  return cn(
    BASE,
    VARIANTS[variant ?? "default"],
    SIZES[size ?? "default"],
    className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  /** Render the child element instead of a <button>, merging props onto it. */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const classes = buttonVariants({ variant, size, className });

    // `asChild` in ten lines instead of a dependency: hand the caller's element
    // the props this button would have rendered.
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<Record<string, unknown>>;
      return React.cloneElement(child, {
        ...props,
        className: cn(classes, child.props.className as string | undefined),
        ref,
      });
    }

    return (
      <button className={classes} ref={ref} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button };
