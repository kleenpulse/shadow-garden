"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import gsap from "gsap";
import type CanvasConfetti from "canvas-confetti";

// Full-screen celebratory overlay shown after a completed Polar checkout. Modeled
// on IntroOverlay's fixed-overlay idiom: window-capture scroll-lock (Lenis-proof),
// gsap entrance, prefers-reduced-motion bail, high z-index. Amethyst confetti fires
// onto a dedicated canvas layered above the panel so it clears the backdrop.

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Amethyst-toned confetti sourced from the runtime accent tokens (theme-correct in
// both light and dark). Draws on the passed canvas so layering is under our control.
function fireConfetti(canvas: HTMLCanvasElement): () => void {
  let cancelled = false;
  let reset: (() => void) | undefined;

  void (async () => {
    const confetti = (await import("canvas-confetti")).default;
    if (cancelled) return;

    const css = getComputedStyle(document.documentElement);
    const colors = ["--sg-accent", "--sg-accent-hover", "--sg-accent-muted", "--sg-ink"]
      .map((v) => css.getPropertyValue(v).trim())
      .filter(Boolean);

    const shoot = confetti.create(canvas, { resize: true, useWorker: true });
    reset = () => shoot.reset();

    const burst = (particleRatio: number, opts: CanvasConfetti.Options) =>
      void shoot({
        origin: { y: 0.42 },
        colors,
        disableForReducedMotion: true,
        particleCount: Math.floor(200 * particleRatio),
        ...opts,
      });

    burst(0.25, { spread: 26, startVelocity: 55 });
    burst(0.2, { spread: 60 });
    burst(0.35, { spread: 100, decay: 0.91, scalar: 0.9 });
    burst(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    burst(0.1, { spread: 120, startVelocity: 45 });
  })();

  return () => {
    cancelled = true;
    reset?.();
  };
}

export default function SuccessOverlay({ onDismiss }: { onDismiss: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dismissed = useRef(false);
  const t = useTranslations("chrome.successOverlay");

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    const root = rootRef.current;
    if (root && !prefersReducedMotion()) {
      gsap.to(root, {
        opacity: 0,
        duration: 0.3,
        ease: "power1.in",
        onComplete: onDismiss,
      });
    } else {
      onDismiss();
    }
  }, [onDismiss]);

  useEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!root || !panel || !backdrop) return;

    // Input-level scroll lock (same technique as IntroOverlay): the app runs Lenis,
    // so plain overflow won't hold — intercept wheel/touch at the window capture phase.
    const blockScroll = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("wheel", blockScroll, { capture: true, passive: false });
    window.addEventListener("touchmove", blockScroll, {
      capture: true,
      passive: false,
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);

    const rise = panel.querySelectorAll<HTMLElement>("[data-rise]");
    let tl: gsap.core.Timeline | null = null;
    let confettiCleanup: (() => void) | undefined;

    if (prefersReducedMotion()) {
      // No burst, no travel — just present the panel, fully readable and actionable.
      gsap.set(backdrop, { opacity: 1 });
      gsap.set(panel, { opacity: 1, y: 0, scale: 1 });
      gsap.set(rise, { opacity: 1, y: 0 });
    } else {
      tl = gsap.timeline();
      tl.fromTo(
        backdrop,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: "power1.out" },
        0,
      );
      tl.fromTo(
        panel,
        { opacity: 0, y: 16, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" },
        0.05,
      );
      tl.fromTo(
        rise,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.09, ease: "power2.out" },
        0.22,
      );
      tl.call(
        () => {
          if (canvasRef.current) confettiCleanup = fireConfetti(canvasRef.current);
        },
        undefined,
        0.4,
      );
    }

    return () => {
      window.removeEventListener("wheel", blockScroll, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("touchmove", blockScroll, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("keydown", onKey);
      tl?.kill();
      confettiCleanup?.();
    };
  }, [dismiss]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("ariaLabel")}
      className="fixed inset-0 flex touch-none items-center justify-center"
      style={{ zIndex: 10001 /* above IntroOverlay (10000) and GotoTop (9999) */ }}
    >
      <div
        ref={backdropRef}
        aria-hidden
        onClick={() => dismiss()}
        className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        className="relative mx-4 w-full max-w-md rounded-2xl border border-hairline bg-panel p-8 text-center shadow-2xl"
      >
        <p
          data-rise
          className="font-display text-[11px] uppercase tracking-[0.28em] text-accent"
        >
          {t("kicker")}
        </p>
        <h2
          data-rise
          className="mt-4 font-display text-2xl tracking-tight text-ink"
        >
          {t("title")}
        </h2>
        <p
          data-rise
          className="mt-3 font-sans text-sm leading-relaxed text-ink-dim"
        >
          {t("body")}
        </p>
        <button
          data-rise
          type="button"
          onClick={() => dismiss()}
          className="mt-7 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-sans text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t("cta")}
          <span aria-hidden>→</span>
        </button>
      </div>

      {/* Dedicated confetti canvas, above the panel; pointer-events-none so clicks
          fall through to the backdrop/panel. */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
}
