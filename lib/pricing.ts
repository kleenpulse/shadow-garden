// Structural plan config for the PricingModal — slugs, ordering, feature counts.
// Every display string (name, price, cadence, tagline, CTA, features) lives in
// the i18n catalogs under chrome.pricingModal.plans.<slug>.*, so the modal reads
// this table for shape and the messages for words. Prices there are presentation
// only; Polar is the source of truth for the actual charge. `slug` maps to
// /api/checkout?plan=<slug>.

export interface Plan {
  slug: "lifetime" | "subscription";
  /** How many chrome.pricingModal.plans.<slug>.features.<n> keys exist. */
  featureCount: number;
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  { slug: "lifetime", featureCount: 4, highlighted: true },
  { slug: "subscription", featureCount: 4 },
];
