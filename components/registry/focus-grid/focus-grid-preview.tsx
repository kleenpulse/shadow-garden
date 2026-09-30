"use client";

import type { PreviewProps } from "@/lib/registry/types";
import FocusGrid, { type FocusGridItem } from "./focus-grid";

// Photos live here rather than in FocusGrid, so the component a customer copies
// ships with no assets at all.
const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=1000&q=80&auto=format&fit=crop`;

const ITEMS: FocusGridItem[] = [
  {
    key: "arrival",
    title: "Arrival",
    description:
      "Burgundy wool, dark glasses, and every bag already paid for before the door closed.",
    image: photo("1483985988355-763728e1935b"),
    alt: "Woman in a burgundy wool coat and sunglasses carrying shopping bags",
    imagePosition: "50% 30%",
  },
  {
    key: "tailoring",
    title: "Tailoring",
    description:
      "Navy cut close to the frame, walked through the atrium like it was built around him.",
    image: photo("1617137968427-85924c800a22"),
    alt: "Man in a navy suit walking through an atrium",
    imagePosition: "50% 30%",
  },
  {
    key: "leather",
    title: "Leather",
    description: "One red handle. The rest of the outfit answers to it.",
    image: photo("1584917865442-de89df76afd3"),
    alt: "Red leather top-handle bag",
  },
  {
    key: "gold",
    title: "Gold",
    description: "Layered, never matched, worn until the clasps go soft.",
    image: photo("1590548784585-643d2b9f2925"),
    alt: "Layered gold necklaces",
  },
  {
    key: "square",
    title: "Square",
    description:
      "Pale blue against old stone and a hundred pigeons that could not care less.",
    image: photo("1539109136881-3be0616acf4b"),
    alt: "Woman in a pale blue coat in a cathedral square surrounded by pigeons",
    imagePosition: "50% 35%",
  },
];

export default function FocusGridPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <FocusGrid
        items={ITEMS}
        gap={values.gap as number}
        radius={values.radius as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        captions={values.captions as boolean}
        heroSide={values.heroSide as "left" | "right"}
        reducedMotion={reducedMotion}
        className="aspect-[1224/680] h-auto max-h-full max-w-3xl"
      />
    </div>
  );
}
