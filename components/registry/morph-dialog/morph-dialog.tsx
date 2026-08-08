"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
  type Transition,
} from "motion/react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared-layout "morph" dialog: a trigger element carrying a stable `layoutId`
 * and a `<MorphPanel layoutId=…>` with the SAME id. When `open` flips true the
 * panel adopts the trigger's box and motion morphs it into the centered panel;
 * on close it morphs back. Sub-elements (icon, title, …) can travel too by
 * sharing ids via `<MorphShared layoutId=…>` in both places.
 *
 * Two things every consumer must know:
 * - The close morph animates the SURVIVING trigger element, which lives in the
 *   page tree — wrap the trigger tree in
 *   `<MotionConfig transition={morphTransition(stiffness, damping)}>` with the
 *   same values you pass the panel, or the open and close springs diverge.
 *   For the same reason, a trigger inside an `overflow-hidden` ancestor clips
 *   the traveling box wherever the flight path leaves that ancestor.
 * - Omit `layoutId` (or reduced motion) → a plain centered fade+scale pop, so
 *   dialogs with no stable origin still animate.
 */

/** The morph spring. Build it once from the same values in trigger and panel. */
export function morphTransition(stiffness: number, damping: number): Transition {
  return { type: "spring", stiffness, damping, mass: 0.8 };
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface MorphPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shared layout id — must match the trigger element's `layoutId`. */
  layoutId?: string;
  /** Spring stiffness of the morph. */
  stiffness?: number;
  /** Spring damping — lower rings longer. */
  damping?: number;
  /** Panel corner radius in px (inline so motion interpolates it mid-morph). */
  radius?: number;
  /** Frosted blur on the backdrop scrim. */
  blurBackdrop?: boolean;
  /**
   * Focus the first focusable element on open (default). Pass false when that
   * element is a text input on mobile — autofocus pops the virtual keyboard.
   */
  autoFocus?: boolean;
  /**
   * Replaces the backdrop's visual classes. The element itself always renders —
   * pass `bg-transparent` for an invisible click-to-close layer.
   */
  backdropClassName?: string;
  /** Inline styles for the panel element. */
  style?: CSSProperties;
  /** Fires when the panel's enter OR exit animation completes. */
  onAnimationComplete?: () => void;
  className?: string;
  children: ReactNode;
  reducedMotion?: boolean;
  /** Dialog semantics — pass `'alertdialog'` for destructive confirmations. */
  role?: "dialog" | "alertdialog";
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function MorphPanel({
  open,
  onOpenChange,
  layoutId,
  stiffness = 320,
  damping = 34,
  radius = 16,
  blurBackdrop = true,
  autoFocus = true,
  backdropClassName,
  style,
  onAnimationComplete,
  className,
  children,
  reducedMotion = false,
  role = "dialog",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedby,
}: MorphPanelProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // If a nested overlay is open, let it own Escape — both listeners live
        // on `document` and ours fires first, so without this guard one
        // keystroke would close both. Any other open aria-modal dialog wins.
        const dialogs = document.querySelectorAll(
          '[role="dialog"][aria-modal="true"]',
        );
        if (Array.from(dialogs).some((node) => node !== containerRef.current)) {
          return;
        }
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusables =
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("overflow-hidden");
    if (autoFocus) {
      containerRef.current
        ?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)?.[0]
        ?.focus();
    }
    return () => document.body.classList.remove("overflow-hidden");
  }, [open, autoFocus]);

  useEffect(() => {
    if (!open) openerRef.current?.focus?.();
  }, [open]);

  const transition = useMemo(
    () => morphTransition(stiffness, damping),
    [stiffness, damping],
  );

  if (!mounted) return null;

  // A real morph only happens when motion is allowed AND a shared `layoutId`
  // is given (a trigger box to fly from). Otherwise fall back to a centered
  // fade+scale pop so the panel still animates in and out.
  const morph = !reducedMotion && Boolean(layoutId);
  const fade = {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
  };

  return createPortal(
    <MotionConfig transition={reducedMotion ? { duration: 0 } : transition}>
      <AnimatePresence initial={false} mode="sync">
        {open && (
          <>
            <motion.div
              key="morph-backdrop"
              className={cn(
                "fixed inset-0 z-40 h-full w-full",
                backdropClassName ??
                  cn(
                    "bg-white/40 dark:bg-black/50",
                    blurBackdrop && "backdrop-blur-xs",
                  ),
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
            />
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                ref={containerRef}
                layoutId={morph ? layoutId : undefined}
                initial={morph ? false : fade.initial}
                animate={morph ? undefined : fade.animate}
                exit={morph ? undefined : fade.exit}
                style={{ borderRadius: radius, ...style }}
                onAnimationComplete={onAnimationComplete}
                role={role}
                aria-modal="true"
                aria-label={ariaLabel}
                aria-describedby={ariaDescribedby}
                className={cn("pointer-events-auto overflow-hidden", className)}
              >
                {children}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  );
}

type MorphTag = "div" | "span" | "h2" | "h3" | "p";

export type MorphSharedProps<T extends MorphTag = "div"> = {
  as?: T;
  /** Shared layout id. When omitted (or `reducedMotion`), renders a plain tag. */
  layoutId?: string;
  reducedMotion?: boolean;
} & Omit<ComponentProps<T>, "ref">;

/**
 * A single element that travels between trigger and panel. Render it in BOTH
 * places with the same `layoutId` and motion morphs one into the other. Falls
 * back to a plain element when there is no id or reduced motion is requested,
 * so the markup stays identical either way.
 */
export function MorphShared<T extends MorphTag = "div">({
  as,
  layoutId,
  reducedMotion = false,
  children,
  ...rest
}: MorphSharedProps<T>) {
  const tag = (as ?? "div") as MorphTag;

  // React 19's JSX checker collapses a union-typed ElementType's props to
  // `never`, so both branches render through a loosely-typed alias. Runtime
  // behavior is identical — a plain tag or its motion twin.
  if (reducedMotion || !layoutId) {
    const Plain = tag as unknown as ComponentType<Record<string, unknown>>;
    return <Plain {...rest}>{children}</Plain>;
  }

  const MotionTag = motion[tag] as ComponentType<Record<string, unknown>>;
  return (
    <MotionTag layoutId={layoutId} {...rest}>
      {children}
    </MotionTag>
  );
}

export interface MorphDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Shared layout id — must match the trigger element's `layoutId`. */
  layoutId?: string;
  stiffness?: number;
  damping?: number;
  radius?: number;
  blurBackdrop?: boolean;
  autoFocus?: boolean;
  /** Force reduced motion (OS preference is honored automatically). */
  reducedMotion?: boolean;
  role?: "dialog" | "alertdialog";
}

/**
 * Drop-in dialog chrome on top of `MorphPanel`: title/description/close-button
 * header, content crossfading in as the box settles. Pass a `layoutId` matching
 * the trigger element for the morph; omit it for a plain centered fade.
 */
export default function MorphDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  layoutId,
  stiffness = 320,
  damping = 34,
  radius = 16,
  blurBackdrop = true,
  autoFocus = true,
  reducedMotion,
  role = "dialog",
}: MorphDialogProps) {
  const osReduce = useReducedMotion();
  const reduce = Boolean(osReduce) || Boolean(reducedMotion);
  const descId = useId();

  return (
    <MorphPanel
      open={open}
      onOpenChange={onOpenChange}
      layoutId={layoutId}
      stiffness={stiffness}
      damping={damping}
      radius={radius}
      blurBackdrop={blurBackdrop}
      autoFocus={autoFocus}
      reducedMotion={reduce}
      role={role}
      aria-label={title}
      aria-describedby={description ? descId : undefined}
      className={cn(
        "flex max-h-[85svh] w-full max-w-sm flex-col overflow-hidden border border-hairline bg-panel shadow-2xl",
        className,
      )}
    >
      {/* Content crossfades in as the box settles — container morphs, content fades. */}
      <motion.div
        className="flex min-h-0 flex-1 flex-col"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduce ? undefined : { duration: 0.18, delay: 0.12 }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-sm text-ink">{title}</h2>
            {description && (
              <p id={descId} className="font-sans text-xs leading-relaxed text-ink-mute">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="-mt-0.5 -mr-1.5 rounded-md p-1.5 text-ink-dim transition-colors hover:bg-raised hover:text-ink"
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </MorphPanel>
  );
}
