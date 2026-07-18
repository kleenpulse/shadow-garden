"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A grid of 3D flip cards. Clicking a card captures its state with GSAP Flip,
 * reparents the real DOM node into a component-owned portal, and flies it to
 * viewport center while rotating 180° mid-flight to reveal its back face.
 * Escape, click-outside, or the close button reverse the flight back into the
 * card's grid placeholder.
 *
 * The moved card is a React-owned node living outside React's expected
 * position while open. That is safe only while the tree shape stays stable:
 * cards are never conditionally mounted or re-keyed — siblings dim via inline
 * style, never `{active && <Card/>}` — or React's placeholder reconciliation
 * would throw "node is not a child".
 */

gsap.registerPlugin(Flip);

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface FlipCardItem {
  id: string;
  front: ReactNode;
  back: ReactNode;
}

export interface FlipCardProps {
  items: FlipCardItem[];
  /** Duration of the Flip flight in seconds; rotation timing derives from it. */
  flipDuration?: number;
  /** 3D perspective depth on each card, px. */
  perspective?: number;
  /** Expanded card width, px — clamped to the viewport. */
  expandedWidth?: number;
  /** Expanded card height, px — clamped to the viewport. */
  expandedHeight?: number;
  /** Backdrop scrim blur while a card is open, px. */
  backdropBlur?: number;
  /** Force reduced motion (OS preference is honored automatically). */
  reducedMotion?: boolean;
  /** Grid layout override. */
  className?: string;
  /** Extra classes on each card cell. */
  cardClassName?: string;
}

export default function FlipCard({
  items,
  flipDuration = 0.5,
  perspective = 1200,
  expandedWidth = 400,
  expandedHeight = 480,
  backdropBlur = 2,
  reducedMotion = false,
  className,
  cardClassName,
}: FlipCardProps) {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardInnerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const placeholderRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [osReduced, setOsReduced] = useState(false);

  const reduce = osReduced || reducedMotion;

  // Computed in effects so the pre-render never touches `window`.
  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setOsReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // One portal container per instance. Removing it on unmount also takes a
  // stranded open card with it, so unmount-while-open leaves no orphan DOM.
  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-flip-card-portal", "");
    document.body.appendChild(el);
    portalRef.current = el;
    return () => {
      tlRef.current?.kill();
      el.remove();
      portalRef.current = null;
    };
  }, []);

  const handleOpen = useCallback(
    (id: string) => {
      if (isAnimating || activeId) return;

      const card = cardRefs.current[id];
      const cardInner = cardInnerRefs.current[id];
      const portal = portalRef.current;
      if (!card || !cardInner || !portal) return;

      setIsAnimating(true);
      setActiveId(id);
      tlRef.current?.kill();

      const flipState = Flip.getState(card);
      portal.appendChild(card);

      const width = Math.min(expandedWidth, window.innerWidth - 32);
      const height = Math.min(expandedHeight, window.innerHeight - 64);
      gsap.set(card, {
        position: "fixed",
        top: window.innerHeight / 2 - height / 2,
        left: window.innerWidth / 2 - width / 2,
        right: "auto",
        bottom: "auto",
        xPercent: 0,
        yPercent: 0,
        width,
        height,
        zIndex: 60,
      });

      const frontFace = cardInner.querySelector(".front-face");
      const backFace = cardInner.querySelector<HTMLElement>(".back-face");

      const tl = gsap.timeline({
        onComplete: () => {
          setIsAnimating(false);
          const focusable =
            backFace?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          (focusable ?? card).focus();
        },
      });
      tlRef.current = tl;

      if (reduce) {
        tl.add(
          Flip.from(flipState, {
            duration: flipDuration * 0.6,
            ease: "power2.inOut",
            absolute: true,
          }),
        )
          .to(frontFace, { opacity: 0, duration: 0.2 }, 0.1)
          .set(frontFace, { visibility: "hidden" })
          // Without the rotation the back face points away from the viewer and
          // its backface-visibility culls it — snap the inner to 180 instead.
          .set(cardInner, { rotateY: 180 })
          .set(backFace, { visibility: "visible", opacity: 0 })
          .to(backFace, { opacity: 1, duration: 0.2 });
      } else {
        tl.add(
          Flip.from(flipState, {
            duration: flipDuration,
            ease: "power3.inOut",
            absolute: true,
          }),
        )
          .to(
            cardInner,
            { rotateY: 90, duration: flipDuration / 2, ease: "power2.in" },
            flipDuration * 0.4,
          )
          .set(frontFace, { visibility: "hidden" })
          .set(backFace, { visibility: "visible", opacity: 1 })
          .to(cardInner, {
            rotateY: 180,
            duration: flipDuration / 2,
            ease: "power2.out",
          });
      }
    },
    [activeId, isAnimating, expandedWidth, expandedHeight, flipDuration, reduce],
  );

  const handleClose = useCallback(() => {
    if (isAnimating || !activeId) return;

    const id = activeId;
    const card = cardRefs.current[id];
    const cardInner = cardInnerRefs.current[id];
    const placeholder = placeholderRefs.current[id];
    if (!card || !cardInner || !placeholder) return;

    setIsAnimating(true);
    // Cleared at close start so the backdrop fades during the return flight.
    setActiveId(null);
    tlRef.current?.kill();

    const returnState = Flip.getState(card);

    // Lift the destination cell above its siblings for the landing.
    gsap.set(placeholder, { zIndex: 50 });
    placeholder.appendChild(card);
    gsap.set(card, {
      clearProps:
        "position,top,left,right,bottom,xPercent,yPercent,width,height,zIndex",
    });

    const frontFace = cardInner.querySelector(".front-face");
    const backFace = cardInner.querySelector(".back-face");

    const tl = gsap.timeline({
      onComplete: () => {
        setIsAnimating(false);
        gsap.set(placeholder, { clearProps: "zIndex" });
        card.focus();
      },
    });
    tlRef.current = tl;

    if (reduce) {
      tl.to(backFace, { opacity: 0, duration: 0.2 })
        .set(backFace, { visibility: "hidden" })
        .set(cardInner, { rotateY: 0 })
        .set(frontFace, { visibility: "visible", opacity: 0 })
        .to(frontFace, { opacity: 1, duration: 0.2 })
        .add(
          Flip.from(returnState, {
            duration: flipDuration * 0.6,
            ease: "power2.inOut",
            absolute: true,
          }),
          0,
        );
    } else {
      tl.to(cardInner, {
        rotateY: 90,
        duration: flipDuration / 2,
        ease: "power2.in",
      })
        .set(backFace, { visibility: "hidden" })
        .set(frontFace, { visibility: "visible", opacity: 1 })
        .to(cardInner, {
          rotateY: 0,
          duration: flipDuration / 2,
          ease: "power2.out",
        })
        .add(
          Flip.from(returnState, {
            duration: flipDuration,
            ease: "power3.inOut",
            absolute: true,
          }),
          flipDuration * 0.4,
        );
    }
  }, [activeId, isAnimating, flipDuration, reduce]);

  // Scroll lock, Escape, and click-outside while a card is open.
  useEffect(() => {
    if (!activeId) return;

    document.body.classList.add("overflow-hidden");

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // If a nested overlay is open, let it own Escape — any other open
      // aria-modal dialog wins over this card.
      const card = cardRefs.current[activeId];
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      );
      if (Array.from(dialogs).some((node) => node !== card)) return;
      e.preventDefault();
      handleClose();
    };

    const onClickOutside = (e: MouseEvent) => {
      const card = cardRefs.current[activeId];
      if (card && !card.contains(e.target as Node)) handleClose();
    };

    window.addEventListener("keydown", onKey);
    // Slight delay so the opening click can't immediately close.
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", onClickOutside);
    }, 100);

    return () => {
      document.body.classList.remove("overflow-hidden");
      window.removeEventListener("keydown", onKey);
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [activeId, handleClose]);

  // Keep the open card centered and clamped through resizes and live tuning.
  useEffect(() => {
    if (!activeId || isAnimating) return;
    const card = cardRefs.current[activeId];
    if (!card) return;

    const recenter = () => {
      const width = Math.min(expandedWidth, window.innerWidth - 32);
      const height = Math.min(expandedHeight, window.innerHeight - 64);
      gsap.set(card, {
        top: window.innerHeight / 2 - height / 2,
        left: window.innerWidth / 2 - width / 2,
        width,
        height,
      });
    };
    recenter();
    window.addEventListener("resize", recenter);
    return () => window.removeEventListener("resize", recenter);
  }, [activeId, isAnimating, expandedWidth, expandedHeight]);

  return (
    <>
      {mounted &&
        createPortal(
          <div
            aria-hidden
            onClick={handleClose}
            className={cn(
              "fixed inset-0 z-50 bg-white/40 transition-opacity duration-300 dark:bg-black/50",
              activeId
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0",
            )}
            style={{
              backdropFilter: activeId ? `blur(${backdropBlur}px)` : undefined,
            }}
          />,
          document.body,
        )}

      <div className={cn("grid grid-cols-3 gap-3", className)}>
        {items.map((item) => {
          const isActive = activeId === item.id;
          const isOtherActive = Boolean(activeId) && !isActive;
          return (
            <div
              key={item.id}
              ref={(el) => {
                placeholderRefs.current[item.id] = el;
              }}
              className="relative"
              style={{ aspectRatio: "1 / 1" }}
            >
              <div
                ref={(el) => {
                  cardRefs.current[item.id] = el;
                }}
                role={isActive ? "dialog" : "button"}
                aria-modal={isActive || undefined}
                aria-haspopup="dialog"
                tabIndex={isOtherActive ? -1 : 0}
                onClick={() => handleOpen(item.id)}
                onKeyDown={(e) => {
                  if (isActive) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpen(item.id);
                  }
                }}
                className={cn(
                  "group absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  cardClassName,
                )}
                style={{
                  perspective: `${perspective}px`,
                  opacity: isOtherActive ? 0.3 : 1,
                  pointerEvents: isAnimating || isOtherActive ? "none" : "auto",
                  transition: "opacity 0.3s ease",
                }}
              >
                <div
                  ref={(el) => {
                    cardInnerRefs.current[item.id] = el;
                  }}
                  className="relative h-full w-full"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div
                    className="front-face absolute inset-0 h-full w-full overflow-hidden"
                    style={{ backfaceVisibility: "hidden" } as CSSProperties}
                  >
                    <div className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[0.98]">
                      {item.front}
                    </div>
                  </div>

                  <div
                    className="back-face absolute inset-0 h-full w-full overflow-hidden"
                    style={
                      {
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                        visibility: "hidden",
                      } as CSSProperties
                    }
                  >
                    {item.back}
                    {isActive && (
                      <button
                        type="button"
                        aria-label="Close"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClose();
                        }}
                        className="absolute top-3 right-3 z-10 rounded-md p-1.5 text-ink-dim transition-colors hover:bg-raised hover:text-ink"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
