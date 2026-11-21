"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { installCommand, PKG_MANAGERS, type PkgManager } from "@/lib/registry/install";
import { inShadcnRegistry, shadcnAddCommands } from "@/lib/registry/shadcn";
import type { ComponentEntry } from "@/lib/registry/types";
import { absoluteUrl } from "@/lib/site";
import { trackEvent } from "@/lib/stats/track";

type Method = "shadcn" | "manual";

const METHODS: Method[] = ["shadcn", "manual"];

// Arrow keys move along the row and select as they go (automatic activation),
// Home/End jump to the ends. Only the selected tab sits in the Tab order.
function onTabKeyDown<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  items: readonly T[],
  current: T,
  select: (next: T) => void,
) {
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  const at = items.indexOf(current);
  let next: number;
  if (event.key === forward) next = (at + 1) % items.length;
  else if (event.key === back) next = (at - 1 + items.length) % items.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = items.length - 1;
  else return;
  event.preventDefault();
  select(items[next]);
  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  tabs?.[next]?.focus();
}

function tabClass(active: boolean) {
  return `rounded px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
    active ? "bg-raised text-accent" : "text-ink-mute hover:text-ink"
  }`;
}

export default function InstallBlock({ entry }: { entry: ComponentEntry }) {
  const shadcn = inShadcnRegistry(entry);
  const [method, setMethod] = useState<Method>(shadcn ? "shadcn" : "manual");
  const [pm, setPm] = useState<PkgManager>("bun");
  const [copied, setCopied] = useState(false);
  const t = useTranslations("chrome.install");
  const id = useId();
  const panelId = `${id}-panel`;
  const commandId = `${id}-command`;

  const mode: Method = shadcn ? method : "manual";
  const command =
    mode === "shadcn" ? shadcnAddCommands(entry, absoluteUrl)[pm] : installCommand(pm, entry);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      trackEvent(entry.slug, "install");
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard unavailable — no-op.
    }
  };

  const body = (
    <>
      <div className="flex items-center justify-between bg-raised/30 px-2 py-1.5">
        <div role="tablist" aria-label={t("pkgManagerAria")} className="flex gap-0.5">
          {PKG_MANAGERS.map((manager) => {
            const active = manager === pm;
            return (
              <button
                key={manager}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={commandId}
                tabIndex={active ? 0 : -1}
                onClick={() => setPm(manager)}
                onKeyDown={(event) => onTabKeyDown(event, PKG_MANAGERS, pm, setPm)}
                className={tabClass(active)}
              >
                {manager}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={copy}
          className="rounded px-2 py-1 font-mono text-[11px] text-ink-dim transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre id={commandId} className="overflow-x-auto px-4 py-3">
        <code className="font-mono text-xs text-ink">{command}</code>
      </pre>
      {mode === "shadcn" ? (
        <p className="bg-surface/40 px-4 py-3 font-mono text-[11px] text-ink-mute">
          {t("shadcnNote")}
        </p>
      ) : entry.variants.length > 1 ? (
        <div className="bg-surface/40 px-4 py-3">
          <p className="font-mono text-[11px] text-ink-mute">
            {t("thenCopy", { count: entry.variants.length })}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {entry.variants.map((variant) => (
              <li key={variant.file} className="font-mono text-[11px] text-ink-dim">
                {variant.file}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="overflow-hidden rounded-lg bg-panel">
      {shadcn ? (
        <>
          <div className="bg-raised/30 px-2 pt-1.5">
            <div role="tablist" aria-label={t("methodAria")} className="flex gap-0.5">
              {METHODS.map((option) => {
                const active = option === method;
                return (
                  <button
                    key={option}
                    id={`${id}-${option}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={panelId}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setMethod(option)}
                    onKeyDown={(event) => onTabKeyDown(event, METHODS, method, setMethod)}
                    className={tabClass(active)}
                  >
                    {option === "shadcn" ? "shadcn" : t("manual")}
                  </button>
                );
              })}
            </div>
          </div>
          <div id={panelId} role="tabpanel" aria-labelledby={`${id}-${method}`}>
            {body}
          </div>
        </>
      ) : (
        body
      )}
    </div>
  );
}
