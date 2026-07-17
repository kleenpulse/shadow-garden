"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

// Sonner toaster restyled to the bench tokens (graphite panel, hairline border,
// ink text, bench sans) and following next-themes. Vendored as a plain dep — no
// shadcn init, no rival accent token.
export default function ToasterBench() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-right"
      toastOptions={{
        className: "font-sans",
        style: {
          background: "var(--color-panel)",
          border: "1px solid var(--color-hairline)",
          color: "var(--color-ink)",
        },
      }}
    />
  );
}
