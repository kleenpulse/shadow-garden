"use client";

import { useEffect, useRef, useState } from "react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { toast } from "sonner";
import {
  createSupabaseBrowserClient,
  supabaseConfiguredClient,
} from "@/lib/supabase/client";
import {
  CHECKOUT_ERROR_CODES,
  CHECKOUT_ERROR_MESSAGES,
  PORTAL_ERROR_CODES,
  PORTAL_ERROR_MESSAGES,
  type CheckoutErrorMessage,
} from "@/lib/checkout/messages";
import SuccessOverlay from "./SuccessOverlay";

// Reads the checkout-result query params set by the Polar redirect, fires the
// matching UI (success overlay / failure toast), reconciles entitlement from Polar's
// API (webhook-independent), then clears the params so a refresh never re-fires.
// Lives inside a <Suspense> in the shell layout (it reads the URL → must not desugar
// the static /components prerender). Renders null on normal navigation.
export default function CheckoutResult() {
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

  useEffect(() => {
    if (handled.current) return;
    const hasResult = checkout || checkout_error || portal_error || auth_error;
    const returnedFromPolar =
      portal === "1" || customer_session_token || checkout_id;
    if (!hasResult && !returnedFromPolar) return;
    handled.current = true;

    if (checkout === "success") {
      // Pull entitlement from Polar NOW — don't wait on the webhook (which may never
      // arrive: tunnel down, deploy window, retry gap). This is the grant guarantee.
      syncing.current = fetch("/api/checkout/sync", { method: "POST" }).catch(
        () => null,
      );
      setShowSuccess(true);
    } else if (checkout_error) {
      fireToast(CHECKOUT_ERROR_MESSAGES[checkout_error]);
    } else if (portal_error) {
      fireToast(PORTAL_ERROR_MESSAGES[portal_error]);
    } else if (auth_error) {
      toast.error("Sign-in failed", {
        description: "Couldn't complete GitHub sign-in. Please try again.",
      });
    } else if (returnedFromPolar) {
      // Returned from the customer portal (or a stray Polar token) with no explicit
      // result — reconcile silently so portal-side changes (cancel/uncancel/payment
      // method) reflect on return without waiting on the webhook. No overlay, no
      // reload; the account menu re-fetches /api/billing on next open.
      void fetch("/api/checkout/sync", { method: "POST" }).catch(() => null);
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
  ]);

  if (!showSuccess) return null;
  return (
    <SuccessOverlay
      onDismiss={async () => {
        // Ensure the reconcile landed, then hard-reload the clean path so EVERY
        // entitlement-gated surface reflects Pro (Go Pro gone, source unlocked, plan
        // shown) — client islands hold their own fetched state, so a soft refresh
        // wouldn't update them.
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

function fireToast(msg: CheckoutErrorMessage) {
  if (msg.kind === "action") {
    toast(msg.title, {
      description: msg.description,
      action: supabaseConfiguredClient
        ? {
            label: "Sign in",
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

  toast.error(msg.title, { description: msg.description });
}
