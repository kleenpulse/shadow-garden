// Pure code → toast copy map for the ?checkout_error=<code> query param set by
// the checkout route. `kind` drives the sonner variant: "error" = danger toast,
// "action" = neutral toast with a next-step button (sign-in).

export const CHECKOUT_ERROR_CODES = [
  "unconfigured",
  "no_product",
  "signin_required",
  "failed",
] as const;

export type CheckoutErrorCode = (typeof CHECKOUT_ERROR_CODES)[number];

export interface CheckoutErrorMessage {
  title: string;
  description: string;
  kind: "error" | "action";
}

export const CHECKOUT_ERROR_MESSAGES: Record<
  CheckoutErrorCode,
  CheckoutErrorMessage
> = {
  unconfigured: {
    title: "Checkout unavailable",
    description: "Payments aren't configured yet. Try again shortly.",
    kind: "error",
  },
  no_product: {
    title: "Plan not found",
    description: "That plan isn't available right now.",
    kind: "error",
  },
  signin_required: {
    title: "Sign in to continue",
    description: "A purchase must be tied to your account.",
    kind: "action",
  },
  failed: {
    title: "Checkout didn't start",
    description: "Something went wrong reaching the store. Please try again.",
    kind: "error",
  },
};

// Errors from the /api/portal redirect (?portal_error=<code>).
export const PORTAL_ERROR_CODES = [
  "unconfigured",
  "signin_required",
  "failed",
] as const;

export type PortalErrorCode = (typeof PORTAL_ERROR_CODES)[number];

export const PORTAL_ERROR_MESSAGES: Record<PortalErrorCode, CheckoutErrorMessage> =
  {
    unconfigured: {
      title: "Billing unavailable",
      description: "Payments aren't configured yet.",
      kind: "error",
    },
    signin_required: {
      title: "Sign in to manage billing",
      description: "You need to be signed in to open the billing portal.",
      kind: "action",
    },
    failed: {
      title: "Couldn't open billing",
      description: "We couldn't reach the billing portal. Please try again.",
      kind: "error",
    },
  };
