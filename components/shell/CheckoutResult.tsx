"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { toast } from "sonner";
import {
  createSupabaseBrowserClient,
  supabaseConfiguredClient,
} from "@/lib/supabase/client";
import {
  CHECKOUT_ERROR_CODES,
  CHECKOUT_ERROR_KIND,
  PORTAL_ERROR_CODES,
  PORTAL_ERROR_KIND,
  type ErrorKind,
} from "@/lib/checkout/messages";
import { invalidatePro } from "@/hooks/use-pro";
import SuccessOverlay from "./SuccessOverlay";

// Reads the checkout-result query params set by the Polar redirect, fires the
// matching UI (success overlay / failure toast), reconciles entitlement from
// Polar's API (webhook-independent), then clears the params so a refresh never
// re-fires. Lives inside a <Suspense> in the shell layout (it reads the URL →
// must not desugar the static /components prerender). Renders null on normal
// navigation.
export default function CheckoutResult() {
  const t = useTranslations("chrome.checkout");
  const [
    {
      checkout,
      checkout_error,
      portal_error,
      auth_error,
      portal,
      customer_session_token,
      checkout_id,
    },
    setParams,
  ] = useQueryStates(
    {
      checkout: parseAsStringLiteral(["success"] as const),
      checkout_error: parseAsStringLiteral(CHECKOUT_ERROR_CODES),
      portal_error: parseAsStringLiteral(PORTAL_ERROR_CODES),
      auth_error: parseAsStringLiteral(["1"] as const),
      // Deterministic "returned from the customer portal" signal (set as the portal
      // session returnUrl) → reconcile entitlement on return.
      portal: parseAsStringLiteral(["1"] as const),
      // Polar appends these to every return URL (checkout + portal). nuqs never
      // touched them before → they orphaned in the address bar. Strip them too.
      customer_session_token: parseAsString,
      checkout_id: parseAsString,
    },
    { history: "replace", shallow: true, clearOnDefault: true },
  );

  const [showSuccess, setShowSuccess] = useState(false);
  const handled = useRef(false);
  // Holds the in-flight reconcile so dismiss can await it before the hard reload.
  const syncing = useRef<Promise<unknown> | null>(null);

  // fireToast lives inside the component for the translator; it captures no
  // other render state.
  const fireToast = (kind: ErrorKind, title: string, description: string) => {
    if (kind === "action") {
      toast(title, {
        description,
        action: supabaseConfiguredClient
          ? {
              label: t("signInAction"),
              onClick: () => {
                const supabase = createSupabaseBrowserClient();
                void supabase.auth.signInWithOAuth({
                  provider: "github",
                  options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
                      window.location.pathname,
                    )}`,
                  },
                });
              },
            }
          : undefined,
      });
      return;
    }
    toast.error(title, { description });
  };
  const fireToastRef = useRef(fireToast);
  fireToastRef.current = fireToast;

  useEffect(() => {
    if (handled.current) return;
    const hasResult = checkout || checkout_error || portal_error || auth_error;
    const returnedFromPolar =
      portal === "1" || customer_session_token || checkout_id;
    if (!hasResult && !returnedFromPolar) return;
    handled.current = true;

    if (checkout === "success") {
      // Pull entitlement from Polar NOW — don't wait on the webhook (which may
      // never arrive: tunnel down, deploy window, retry gap). This is the grant
      // guarantee.
      syncing.current = fetch("/api/checkout/sync", { method: "POST" }).catch(
        () => null,
      );
      setShowSuccess(true);
    } else if (checkout_error) {
      fireToastRef.current(
        CHECKOUT_ERROR_KIND[checkout_error],
        t(`errors.${checkout_error}.title`),
        t(`errors.${checkout_error}.description`),
      );
    } else if (portal_error) {
      fireToastRef.current(
        PORTAL_ERROR_KIND[portal_error],
        t(`portalErrors.${portal_error}.title`),
        t(`portalErrors.${portal_error}.description`),
      );
    } else if (auth_error) {
      toast.error(t("authError.title"), {
        description: t("authError.description"),
      });
    } else if (returnedFromPolar) {
      // Returned from the customer portal (or a stray Polar token) with no
      // explicit result — reconcile silently so portal-side changes
      // (cancel/uncancel/payment method) reflect on return without waiting on
      // the webhook. No overlay, no reload: dropping the Pro cache once the
      // reconcile lands re-renders the plan in place.
      void fetch("/api/checkout/sync", { method: "POST" })
        .catch(() => null)
        .finally(() => invalidatePro());
    }

    // Strip every Polar/result param (client-only, shallow) so F5 lands on a clean URL.
    void setParams({
      checkout: null,
      checkout_error: null,
      portal_error: null,
      auth_error: null,
      portal: null,
      customer_session_token: null,
      checkout_id: null,
    });
  }, [
    checkout,
    checkout_error,
    portal_error,
    auth_error,
    portal,
    customer_session_token,
    checkout_id,
    setParams,
    t,
  ]);

  if (!showSuccess) return null;
  return (
    <SuccessOverlay
      onDismiss={async () => {
        // Ensure the reconcile landed, then hard-reload the clean path so EVERY
        // entitlement-gated surface reflects Pro (Go Pro gone, source unlocked,
        // plan shown) — client islands hold their own fetched state, so a soft
        // refresh wouldn't update them.
        try {
          await syncing.current;
        } catch {
          // ignore — reload regardless; the webhook is the other backstop
        }
        window.location.assign(window.location.pathname);
      }}
    />
  );
}
