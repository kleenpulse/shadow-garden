// Display-only plan config for the PricingModal. Prices are for presentation; Polar
// is the source of truth for the actual charge. `slug` maps to /api/checkout?plan=<slug>.

export interface Plan {
  slug: "lifetime" | "subscription";
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  cta: string;
  features: string[];
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  {
    slug: "lifetime",
    name: "Lifetime",
    price: "$99",
    cadence: "one-time",
    tagline: "Buy once, own it forever.",
    cta: "Buy Lifetime",
    features: [
      "Full source for every Pro component",
      "Unlimited personal & commercial use",
      "All future components included",
      "No recurring fees",
    ],
    highlighted: true,
  },
  {
    slug: "subscription",
    name: "Membership",
    price: "$4.99",
    cadence: "/month",
    tagline: "Full access, billed monthly.",
    cta: "Subscribe",
    features: [
      "Full source for every Pro component",
      "Unlimited personal & commercial use",
      "New components the moment they ship",
      "Cancel anytime",
    ],
  },
];
