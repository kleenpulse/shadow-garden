import Link from "next/link";
import HeroStage from "@/components/shell/HeroStage";
import ThemeToggle from "@/components/shell/ThemeToggle";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <ThemeToggle className="fixed right-4 top-4 z-50 bg-panel/70 backdrop-blur" />
      <HeroStage />

      <div className="relative z-10 max-w-2xl">
        <p className="font-display text-[11px] uppercase tracking-[0.3em] text-accent">
          Component Library
        </p>
        <h1 className="mt-4 font-display text-4xl uppercase tracking-[0.12em] text-ink sm:text-6xl">
          Shadow Garden
        </h1>
        <p className="mx-auto mt-5 max-w-xl font-sans text-sm text-ink-dim sm:text-base">
          A tunable gallery of animation-forward React components. Preview them live, dial in every
          parameter, and copy the source in your stack.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 font-display text-[11px] uppercase tracking-[0.15em]">
          <Link
            href="/components"
            className="rounded-md bg-accent px-4 py-2 text-on-accent transition-colors hover:bg-accent-hover"
          >
            Enter the catalog
          </Link>
          <Link
            href="/components/threads"
            className="rounded-md border border-hairline px-4 py-2 text-ink-dim transition-colors hover:border-accent-muted hover:text-ink"
          >
            Start with Threads
          </Link>
        </div>
      </div>
    </main>
  );
}
