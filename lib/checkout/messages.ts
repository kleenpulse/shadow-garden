// Code tables for the ?checkout_error=<code> / ?portal_error=<code> query
// params set by the checkout and portal routes. The toast copy itself lives in
// the i18n catalogs (chrome.checkout.errors.<code>.* / portalErrors.<code>.*) —
// CheckoutResult resolves it client-side; this module only names the codes and
// which sonner variant each one drives: "error" = danger toast, "action" =
// neutral toast with a next-step button (sign-in).

export const CHECKOUT_ERROR_CODES = [
  "unconfigured",
  "no_product",
  "signin_required",
  "failed",
] as const;

export type CheckoutErrorCode = (typeof CHECKOUT_ERROR_CODES)[number];

export type ErrorKind = "error" | "action";

export const CHECKOUT_ERROR_KIND: Record<CheckoutErrorCode, ErrorKind> = {
  unconfigured: "error",
  no_product: "error",
  signin_required: "action",
  failed: "error",
};

// Errors from the /api/portal redirect (?portal_error=<code>).
export const PORTAL_ERROR_CODES = [
  "unconfigured",
  "signin_required",
  "failed",
] as const;

export type PortalErrorCode = (typeof PORTAL_ERROR_CODES)[number];

export const PORTAL_ERROR_KIND: Record<PortalErrorCode, ErrorKind> = {
  unconfigured: "error",
  signin_required: "action",
  failed: "error",
};
