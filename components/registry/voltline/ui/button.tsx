"use client";

import * as React from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";
import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";

// The magnetic button.
//
// Rewritten without `class-variance-authority` and `@radix-ui/react-slot`. Both
// were doing a small job — a lookup table and a clone — and neither is worth a
// package on the install line of a template. The variants that referenced tokens
// this project never declared (`destructive`, `secondary`, `ghost`) are gone too:
// they compiled to nothing, so they were choices that did not exist.

const BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)] disabled:pointer-events-none disabled:opacity-90 font-[family-name:var(--font-body)]";

const VARIANTS = {
  default:
    "bg-[var(--primary)] text-white font-[300] shadow hover:bg-[var(--primary)]/90",
  outline:
    "border border-[var(--soft-border)] bg-[var(--surface-white)] shadow-sm hover:bg-[var(--soft-border)] hover:text-[var(--primary)]",
  link: "text-[var(--primary)] underline-offset-4 hover:underline",
} as const;

const SIZES = {
  default: "lg:py-5 px-8 py-3 rounded-full",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-8",
  icon: "h-9 w-9",
  link: "flex",
  ghost: "relative",
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
  return cn(BASE, VARIANTS[variant ?? "default"], SIZES[size ?? "default"], className);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  /** Render the child element instead of a <button>, merging props onto it. */
  asChild?: boolean;
  /** Opt into the magnetic pointer follow. Off by default — it is a deliberate accent. */
  useGsap?: boolean;
  children?: React.ReactNode;
  href?: string;
}

/** Pull strengths, in px, at the pointer's furthest offset from centre. */
const MAGNET_STRENGTH = 40;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      children,
      useGsap = false,
      href,
      ...props
    },
    ref,
  ) => {
    const magnetRef = React.useRef<HTMLButtonElement | null>(null);
    const magnetTextRef = React.useRef<HTMLSpanElement | null>(null);
    const still = useStill();

    useGSAP(() => {
      // No pointer, no magnet — and reduced motion means the button should simply
      // be a button.
      if (
        !magnetRef.current ||
        !useGsap ||
        still ||
        props.disabled ||
        window.matchMedia("(hover: none)").matches
      ) {
        return;
      }

      const magnet = magnetRef.current;
      const magnetText = magnetTextRef.current;

      const initMagnet = (event: MouseEvent) => {
        const box = magnet.getBoundingClientRect();
        const x = (event.clientX - box.left) / magnet.offsetWidth - 0.5;
        const y = (event.clientY - box.top) / magnet.offsetHeight - 0.5;

        gsap.to(magnet, {
          x: x * MAGNET_STRENGTH,
          y: y * MAGNET_STRENGTH,
          duration: 1,
          ease: "power4.out",
        });
        // The label trails the button by the same amount, which is what makes the
        // control feel like a soft object rather than a sliding rectangle.
        gsap.to(magnetText, {
          x: x * MAGNET_STRENGTH,
          y: y * MAGNET_STRENGTH,
          duration: 1,
          ease: "power4.out",
        });
      };

      const deactivateMagnet = () => {
        gsap.to(magnet, { x: 0, y: 0, duration: 2, ease: "elastic.out" });
        gsap.to(magnetText, { x: 0, y: 0, duration: 1, ease: "elastic.out" });
      };

      magnet.addEventListener("mousemove", initMagnet);
      magnet.addEventListener("mouseleave", deactivateMagnet);

      return () => {
        magnet.removeEventListener("mousemove", initMagnet);
        magnet.removeEventListener("mouseleave", deactivateMagnet);
      };
    }, [useGsap, still, props.disabled]);

    const classes = buttonVariants({ variant, size, className });

    // `asChild` in ten lines instead of a dependency: hand the caller's element the
    // props this button would have rendered.
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<Record<string, unknown>>;
      return React.cloneElement(child, {
        ...props,
        className: cn(classes, child.props.className as string | undefined),
        ref: useGsap ? magnetRef : ref,
      });
    }

    return (
      <button
        className={classes}
        ref={useGsap ? magnetRef : ref}
        {...props}
      >
        {/* Wrapped so the label can be moved independently of the button box. */}
        <span ref={useGsap ? magnetTextRef : null}>{children}</span>
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button };
