// The geometry behind the treemap: pure functions, no React and no DOM.

export interface TreemapNode {
	/** Unique across the whole tree. Cells are tracked by it between layouts. */
	id: string;
	label: string;
	/** Size of a leaf. A node with children is the sum of them. */
	value?: number;
	children?: TreemapNode[];
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface TreemapCell extends Rect {
	id: string;
	node: TreemapNode;
	/** 1 for a child of the node in focus, 2 for its children, and so on. */
	depth: number;
	/** Drawn as a frame with its own children inside it. */
	group: boolean;
	/** The child of the node in focus that this cell sits under (or is). */
	top: string;
	topIndex: number;
	topCount: number;
	/** Place among its siblings, largest first. */
	rank: number;
	siblings: number;
	value: number;
}

export interface LayoutOptions {
	/** Levels drawn below the node in focus. */
	depth: number;
	/** Space between sibling cells, in px. */
	gap: number;
	/** Height of the label strip at the top of a group, in px. */
	header: number;
	/** Current size of a node. */
	valueOf: (node: TreemapNode) => number;
	/** Fixed size used only to order siblings, so a value that drifts never
	 *  reshuffles the map. */
	orderOf: (node: TreemapNode) => number;
}

/**
 * Squarified treemap (Bruls, Huizing and van Wijk). Fills the box with one
 * rectangle per value, area in proportion, keeping each as close to a square
 * as it can. Rows are laid along the short side of what is left: a row keeps
 * taking the next value for as long as that makes its worst rectangle less
 * stretched, then the row is fixed and the rest of the box is filled the same
 * way.
 */
export function squarify(values: number[], box: Rect): Rect[] {
	const n = values.length;
	const out: Rect[] = new Array(n);
	let total = 0;
	for (const v of values) total += v > 0 ? v : 0;
	if (n === 0) return out;
	if (!(total > 0) || box.w <= 0 || box.h <= 0) {
		for (let i = 0; i < n; i++) out[i] = { x: box.x, y: box.y, w: 0, h: 0 };
		return out;
	}
	// A zero would make a sliver with no area and an endless aspect ratio.
	const floor = total * 1e-6;
	const scale = (box.w * box.h) / total;
	let x = box.x;
	let y = box.y;
	let w = box.w;
	let h = box.h;
	let i = 0;
	while (i < n) {
		const short = Math.min(w, h);
		const s2 = short * short;
		let sum = 0;
		let min = Infinity;
		let max = 0;
		let best = Infinity;
		let j = i;
		while (j < n) {
			const area = Math.max(values[j], floor) * scale;
			const nextSum = sum + area;
			const nextMin = Math.min(min, area);
			const nextMax = Math.max(max, area);
			const worst = Math.max(
				(s2 * nextMax) / (nextSum * nextSum),
				(nextSum * nextSum) / (s2 * nextMin),
			);
			if (j > i && worst > best) break;
			sum = nextSum;
			min = nextMin;
			max = nextMax;
			best = worst;
			j++;
		}
		const thick = short > 0 ? sum / short : 0;
		const wide = w >= h;
		let offset = 0;
		for (let k = i; k < j; k++) {
			const area = Math.max(values[k], floor) * scale;
			const length = thick > 0 ? area / thick : 0;
			out[k] = wide
				? { x, y: y + offset, w: thick, h: length }
				: { x: x + offset, y, w: length, h: thick };
			offset += length;
		}
		if (wide) {
			x += thick;
			w -= thick;
		} else {
			y += thick;
			h -= thick;
		}
		i = j;
	}
	return out;
}

/**
 * Lay out everything under `focus` in a box of the given size. Cells come back
 * parents first, in px, with the gap already taken out of each one.
 */
export function layoutTree(
	focus: TreemapNode,
	width: number,
	height: number,
	options: LayoutOptions,
): TreemapCell[] {
	const { depth, gap, header, valueOf, orderOf } = options;
	const half = gap / 2;
	const pad = Math.max(2, gap);
	const out: TreemapCell[] = [];

	const place = (
		parent: TreemapNode,
		box: Rect,
		level: number,
		top: string | null,
		topIndex: number,
		topCount: number,
	) => {
		const kids = (parent.children ?? [])
			.slice()
			.sort((a, b) => orderOf(b) - orderOf(a));
		const rects = squarify(kids.map(valueOf), box);
		kids.forEach((kid, i) => {
			const r = rects[i];
			const cell: Rect = {
				x: r.x + half,
				y: r.y + half,
				w: Math.max(0, r.w - gap),
				h: Math.max(0, r.h - gap),
			};
			// A group needs room for its strip and something under it.
			const roomy = cell.w > header * 3 && cell.h > header * 2.5;
			const group = level < depth && !!kid.children?.length && roomy;
			const isTop = top === null;
			out.push({
				...cell,
				id: kid.id,
				node: kid,
				depth: level,
				group,
				top: isTop ? kid.id : top,
				topIndex: isTop ? i : topIndex,
				topCount: isTop ? kids.length : topCount,
				rank: i,
				siblings: kids.length,
				value: valueOf(kid),
			});
			if (!group) return;
			place(
				kid,
				{
					x: cell.x + pad - half,
					y: cell.y + header - half,
					w: cell.w - pad * 2 + gap,
					h: cell.h - header - pad + gap,
				},
				level + 1,
				isTop ? kid.id : top,
				isTop ? i : topIndex,
				isTop ? kids.length : topCount,
			);
		});
	};

	// The outer box is half a gap larger on every side, so the cells on the
	// edge sit flush with the frame instead of half a gap inside it.
	place(
		focus,
		{ x: -half, y: -half, w: width + gap, h: height + gap },
		1,
		null,
		0,
		0,
	);
	return out;
}
