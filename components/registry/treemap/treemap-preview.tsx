"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Treemap, { type TreemapColorBy, type TreemapNode } from "./treemap";

// A trading house's books: six divisions, three levels deep, and sizes that
// differ by a factor of forty. A treemap of equal boxes shows nothing, and one
// level of nesting hides what the zoom is for.
//
// A module constant, so the tree keeps its identity while the Controls panel
// moves a slider. The component rebuilds its index when `data` changes.
const leaf = (id: string, label: string, value: number): TreemapNode => ({
	id,
	label,
	value,
});

const BOOKS: TreemapNode = {
	id: "mitsugoshi",
	label: "Mitsugoshi",
	children: [
		{
			id: "retail",
			label: "Retail",
			children: [
				{
					id: "chocolate",
					label: "Chocolate",
					children: [
						leaf("dark", "Dark", 420),
						leaf("milk", "Milk", 310),
						leaf("truffles", "Truffles", 180),
						leaf("gift", "Gift boxes", 240),
					],
				},
				{
					id: "fashion",
					label: "Fashion",
					children: [
						leaf("coats", "Coats", 260),
						leaf("dresses", "Dresses", 210),
						leaf("tailoring", "Tailoring", 90),
					],
				},
				{
					id: "cosmetics",
					label: "Cosmetics",
					children: [
						leaf("tint", "Lip tint", 150),
						leaf("powder", "Powder", 110),
						leaf("perfume", "Perfume", 190),
					],
				},
				leaf("housewares", "Housewares", 130),
			],
		},
		{
			id: "banking",
			label: "Banking",
			children: [
				leaf("deposits", "Deposits", 520),
				leaf("loans", "Trade loans", 380),
				leaf("notes", "Credit notes", 290),
				{
					id: "mint",
					label: "Mint",
					children: [leaf("gold", "Gold", 170), leaf("silver", "Silver", 95)],
				},
			],
		},
		{
			id: "logistics",
			label: "Logistics",
			children: [
				{
					id: "caravans",
					label: "Caravans",
					children: [
						leaf("north", "North road", 210),
						leaf("coast", "Coast road", 160),
						leaf("river", "River barges", 120),
					],
				},
				leaf("warehouses", "Warehouses", 230),
				leaf("couriers", "Couriers", 85),
			],
		},
		{
			id: "foods",
			label: "Foods",
			children: [
				leaf("tuna", "Tuna mayo", 205),
				leaf("coffee", "Coffee", 175),
				leaf("rice", "Rice mills", 140),
				leaf("bakeries", "Bakeries", 70),
			],
		},
		{
			id: "leisure",
			label: "Leisure",
			children: [
				leaf("theatre", "Theatre", 120),
				leaf("springs", "Hot springs", 155),
				leaf("lottery", "Lottery", 60),
			],
		},
		{
			id: "research",
			label: "Research",
			children: [
				leaf("slime", "Slime works", 95),
				leaf("alchemy", "Alchemy", 65),
				leaf("patents", "Patents", 40),
			],
		},
	],
};

const compact = new Intl.NumberFormat("en", {
	notation: "compact",
	maximumFractionDigits: 1,
});
const zeni = (value: number) => `${compact.format(value * 1000)} Z`;

export default function TreemapPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="@container relative h-full w-full">
			<div className="absolute inset-0 p-3 @md:p-6">
				<div className="h-full w-full overflow-hidden rounded-xl border border-hairline">
					<Treemap
						data={BOOKS}
						label="Mitsugoshi revenue by division"
						formatValue={zeni}
						gap={values.gap as number}
						depth={values.depth as number}
						live={values.live as boolean}
						speed={values.speed as number}
						labels={values.labels as boolean}
						colorBy={values.colorBy as TreemapColorBy}
						duration={values.duration as number}
						radius={values.radius as number}
						accentColor={values.accentColor as string}
						baseColor={values.baseColor as string}
						paused={paused}
						reducedMotion={reducedMotion}
					/>
				</div>
			</div>
		</div>
	);
}
