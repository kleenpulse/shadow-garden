// The grid half of Pathfinder: maze generation and the searches, as plain data.
// No React, no canvas, no clock. Everything here is a pure function of its
// inputs (mazes come from a seed), so the component can rebuild any board it has
// shown and a test can check every claim made below.
//
// Cells are indexed `y * cols + x`. A wall is `walls[i] === 1`.

export type PathfinderAlgorithm = "astar" | "dijkstra" | "bfs" | "greedy";
export type PathfinderMaze = "backtracker" | "prim" | "scatter";

export interface Maze {
  cols: number;
  rows: number;
  /** 1 = wall, 0 = open. */
  walls: Uint8Array;
  /**
   * The order cells change during the build animation. When `solid` is true
   * the board starts as all wall and these cells open one by one; when it is
   * false the board starts open and these cells become walls.
   */
  order: Int32Array;
  solid: boolean;
  start: number;
  goal: number;
}

/** Small, fast, seedable PRNG. The same seed always builds the same maze. */
export const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Start and goal for a board, on opposite corners. `turn` rotates the pair a
 * quarter turn each time, so consecutive mazes do not all run the same way.
 * Corners sit on odd coordinates, which is where maze rooms live.
 */
export function corners(cols: number, rows: number, turn: number): [number, number] {
  const lx = Math.max(1, cols % 2 === 1 ? cols - 2 : cols - 3);
  const ly = Math.max(1, rows % 2 === 1 ? rows - 2 : rows - 3);
  const xs = [1, lx, lx, 1];
  const ys = [1, 1, ly, ly];
  const a = ((turn % 4) + 4) % 4;
  const b = (a + 2) % 4;
  return [ys[a] * cols + xs[a], ys[b] * cols + xs[b]];
}

export function generate(
  cols: number,
  rows: number,
  kind: PathfinderMaze,
  seed: number,
  turn: number,
): Maze {
  const [start, goal] = corners(cols, rows, turn);
  if (cols < 3 || rows < 3) {
    // Too small for a frame and a room. An open board still searches.
    const n = Math.max(0, cols * rows);
    return { cols, rows, walls: new Uint8Array(n), order: new Int32Array(0), solid: false, start: 0, goal: Math.max(0, n - 1) };
  }
  const rand = mulberry32(seed);
  if (kind === "scatter") return scatter(cols, rows, rand, start, goal);
  return lattice(cols, rows, rand, start, goal, kind === "prim");
}

// ── Perfect mazes on the odd lattice ─────────────────────────────────────────
//
// Rooms sit on odd (x, y); the cells between two rooms are the walls that get
// knocked through. A spanning tree over the rooms is a perfect maze: every
// open cell is reachable and there is exactly one route between any two. Both
// builders start at the start marker, so the carve visibly grows out of it.

function lattice(
  cols: number,
  rows: number,
  rand: () => number,
  start: number,
  goal: number,
  prim: boolean,
): Maze {
  const walls = new Uint8Array(cols * rows).fill(1);
  const rx = Math.max(1, (cols - 1) >> 1);
  const ry = Math.max(1, (rows - 1) >> 1);
  const rooms = rx * ry;
  const order = new Int32Array(rooms * 2 - 1);
  let len = 0;

  const open = (cell: number) => {
    walls[cell] = 0;
    order[len++] = cell;
  };
  const cellOf = (room: number) => {
    const x = room % rx;
    return ((room - x) / rx * 2 + 1) * cols + x * 2 + 1;
  };
  // The wall between two adjacent rooms is the midpoint of their cells.
  const between = (a: number, b: number) => (cellOf(a) + cellOf(b)) / 2;

  const sx = start % cols;
  const first = (((start - sx) / cols - 1) >> 1) * rx + ((sx - 1) >> 1);
  const visited = new Uint8Array(rooms);
  const near = new Int32Array(4);

  const neighbours = (room: number, wantVisited: number) => {
    const x = room % rx;
    const y = (room - x) / rx;
    let k = 0;
    if (x > 0 && visited[room - 1] === wantVisited) near[k++] = room - 1;
    if (x < rx - 1 && visited[room + 1] === wantVisited) near[k++] = room + 1;
    if (y > 0 && visited[room - rx] === wantVisited) near[k++] = room - rx;
    if (y < ry - 1 && visited[room + rx] === wantVisited) near[k++] = room + rx;
    return k;
  };

  visited[first] = 1;
  open(cellOf(first));

  if (!prim) {
    // Recursive backtracker, iterative: long winding corridors, few branches.
    const stack = new Int32Array(rooms);
    let sp = 0;
    stack[sp++] = first;
    while (sp > 0) {
      const room = stack[sp - 1];
      const k = neighbours(room, 0);
      if (k === 0) {
        sp--;
        continue;
      }
      const next = near[Math.floor(rand() * k)];
      open(between(room, next));
      open(cellOf(next));
      visited[next] = 1;
      stack[sp++] = next;
    }
  } else {
    // Randomized Prim: grows from a frontier, so it branches constantly and
    // its dead ends are short. A different texture from the backtracker.
    const frontier = new Int32Array(rooms);
    const inFrontier = new Uint8Array(rooms);
    let fl = 0;
    const grow = (room: number) => {
      const k = neighbours(room, 0);
      for (let i = 0; i < k; i++) {
        const n = near[i];
        if (inFrontier[n]) continue;
        inFrontier[n] = 1;
        frontier[fl++] = n;
      }
    };
    grow(first);
    while (fl > 0) {
      const pick = Math.floor(rand() * fl);
      const room = frontier[pick];
      frontier[pick] = frontier[--fl];
      inFrontier[room] = 0;
      const k = neighbours(room, 1);
      const from = near[Math.floor(rand() * k)];
      open(between(from, room));
      open(cellOf(room));
      visited[room] = 1;
      grow(room);
    }
  }

  return { cols, rows, walls, order: order.slice(0, len), solid: true, start, goal };
}

// ── Scatter: an open field with rocks in it ──────────────────────────────────

const SCATTER_DENSITY = 0.28;

function scatter(
  cols: number,
  rows: number,
  rand: () => number,
  start: number,
  goal: number,
): Maze {
  const n = cols * rows;
  const walls = new Uint8Array(n);
  const order: number[] = [];
  const raise = (cell: number) => {
    walls[cell] = 1;
    order.push(cell);
  };

  // The frame first, swept clockwise, so the build reads as an arena being
  // laid out before anything is dropped into it.
  for (let x = 0; x < cols; x++) raise(x);
  for (let y = 1; y < rows; y++) raise(y * cols + cols - 1);
  for (let x = cols - 2; x >= 0; x--) raise((rows - 1) * cols + x);
  for (let y = rows - 2; y >= 1; y--) raise(y * cols);

  // A clear 3x3 around each marker, so neither is ever boxed in on arrival.
  const keep = new Uint8Array(n);
  for (const cell of [start, goal]) {
    const cx = cell % cols;
    const cy = (cell - cx) / cols;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < cols && y < rows) keep[y * cols + x] = 1;
      }
    }
  }

  const iw = cols - 2;
  const ih = rows - 2;
  const target = Math.round(iw * ih * SCATTER_DENSITY);
  let placed = 0;
  let attempts = iw * ih * 6;
  while (placed < target && attempts-- > 0) {
    const cx = 1 + Math.floor(rand() * iw);
    const cy = 1 + Math.floor(rand() * ih);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        // Ragged 3x3 blobs: corners drop out often, edges now and then, so
        // the field reads as rubble instead of stamped squares.
        const corner = dx !== 0 && dy !== 0;
        const edge = !corner && (dx !== 0 || dy !== 0);
        if (corner && rand() < 0.45) continue;
        if (edge && rand() < 0.12) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x > cols - 2 || y > rows - 2) continue;
        const cell = y * cols + x;
        if (keep[cell] || walls[cell]) continue;
        raise(cell);
        placed++;
      }
    }
  }

  if (!reachable(walls, cols, rows, start, goal)) corridor(walls, cols, rows, rand, start, goal);

  // The corridor may have reopened cells that were raised; they are not part
  // of the build any more.
  const kept = order.filter((cell) => walls[cell] === 1);
  return { cols, rows, walls, order: Int32Array.from(kept), solid: false, start, goal };
}

/** 4-connected flood fill. Scatter guarantees a route even with diagonals off. */
function reachable(walls: Uint8Array, cols: number, rows: number, from: number, to: number) {
  const n = cols * rows;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  seen[from] = 1;
  while (head < tail) {
    const c = queue[head++];
    if (c === to) return true;
    const x = c % cols;
    const y = (c - x) / cols;
    if (x > 0 && !seen[c - 1] && !walls[c - 1]) {
      seen[c - 1] = 1;
      queue[tail++] = c - 1;
    }
    if (x < cols - 1 && !seen[c + 1] && !walls[c + 1]) {
      seen[c + 1] = 1;
      queue[tail++] = c + 1;
    }
    if (y > 0 && !seen[c - cols] && !walls[c - cols]) {
      seen[c - cols] = 1;
      queue[tail++] = c - cols;
    }
    if (y < rows - 1 && !seen[c + cols] && !walls[c + cols]) {
      seen[c + cols] = 1;
      queue[tail++] = c + cols;
    }
  }
  return false;
}

/**
 * Wanders from start to goal clearing whatever it walks through. Biased toward
 * the goal so it arrives quickly, random enough that the cut does not look like
 * a ruler line. Stays inside the frame.
 */
function corridor(
  walls: Uint8Array,
  cols: number,
  rows: number,
  rand: () => number,
  start: number,
  goal: number,
) {
  let x = start % cols;
  let y = (start - x) / cols;
  const gx = goal % cols;
  const gy = (goal - gx) / cols;
  let guard = cols * rows * 8;
  while ((x !== gx || y !== gy) && guard-- > 0) {
    let dx = 0;
    let dy = 0;
    if (rand() < 0.65) {
      if (x !== gx && (y === gy || rand() < 0.5)) dx = Math.sign(gx - x);
      else dy = Math.sign(gy - y);
    } else {
      const d = Math.floor(rand() * 4);
      dx = d === 0 ? 1 : d === 1 ? -1 : 0;
      dy = d === 2 ? 1 : d === 3 ? -1 : 0;
    }
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 1 || ny < 1 || nx > cols - 2 || ny > rows - 2) continue;
    x = nx;
    y = ny;
    walls[y * cols + x] = 0;
  }
  // Out of patience: finish with a straight L so the promise still holds.
  while (x !== gx) {
    x += Math.sign(gx - x);
    walls[y * cols + x] = 0;
  }
  while (y !== gy) {
    y += Math.sign(gy - y);
    walls[y * cols + x] = 0;
  }
}

// ── Search ───────────────────────────────────────────────────────────────────

const SQRT2 = Math.SQRT2;
// Orthogonal steps first, diagonals after: BFS and the tie-breaks below then
// grow neat, symmetric fronts instead of ragged ones.
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Binary min-heap over node ids, ordered by up to three keys. Keys are compared
 * left to right, which is how each search states its own tie-break.
 */
class Heap {
  private ids: Int32Array;
  private k1: Float64Array;
  private k2: Float64Array;
  private k3: Float64Array;
  size = 0;

  constructor(capacity: number) {
    const cap = Math.max(16, capacity);
    this.ids = new Int32Array(cap);
    this.k1 = new Float64Array(cap);
    this.k2 = new Float64Array(cap);
    this.k3 = new Float64Array(cap);
  }

  private less(i: number, j: number) {
    const a = this.k1[i];
    const b = this.k1[j];
    if (a !== b) return a < b;
    const c = this.k2[i];
    const d = this.k2[j];
    if (c !== d) return c < d;
    return this.k3[i] < this.k3[j];
  }

  private swap(i: number, j: number) {
    const id = this.ids[i];
    this.ids[i] = this.ids[j];
    this.ids[j] = id;
    const a = this.k1[i];
    this.k1[i] = this.k1[j];
    this.k1[j] = a;
    const b = this.k2[i];
    this.k2[i] = this.k2[j];
    this.k2[j] = b;
    const c = this.k3[i];
    this.k3[i] = this.k3[j];
    this.k3[j] = c;
  }

  private grow() {
    const cap = this.ids.length * 2;
    const ids = new Int32Array(cap);
    ids.set(this.ids);
    this.ids = ids;
    const k1 = new Float64Array(cap);
    k1.set(this.k1);
    this.k1 = k1;
    const k2 = new Float64Array(cap);
    k2.set(this.k2);
    this.k2 = k2;
    const k3 = new Float64Array(cap);
    k3.set(this.k3);
    this.k3 = k3;
  }

  push(id: number, a: number, b: number, c: number) {
    if (this.size === this.ids.length) this.grow();
    let i = this.size++;
    this.ids[i] = id;
    this.k1[i] = a;
    this.k2[i] = b;
    this.k3[i] = c;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    if (this.size === 0) return -1;
    const top = this.ids[0];
    const last = --this.size;
    if (last > 0) {
      this.swap(0, last);
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < last && this.less(l, m)) m = l;
        if (r < last && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/**
 * One search over one board, advanced in steps so it can be watched.
 *
 * Per cell: `state` is 0 unseen, 1 frontier (queued), 2 closed (expanded).
 * `closedAt` is the expansion count when the cell closed, which is how the
 * renderer ages the explored region. `came` points one step back toward start.
 *
 * Ordering: A* by (f, then h), so among equally good cells it prefers the one
 * nearer the goal and runs straight across open ground; Dijkstra by g; greedy by
 * h alone. Remaining ties go first-in, first-out, which keeps fronts smooth. BFS
 * uses a plain queue and counts steps, not distance.
 *
 * Moves: four-way with a Manhattan heuristic, or eight-way with octile. A
 * diagonal costs √2 and is not allowed when either cell beside it is a wall,
 * so a path never squeezes through a corner.
 */
export class Search {
  readonly cols: number;
  readonly rows: number;
  readonly state: Uint8Array;
  readonly closedAt: Int32Array;
  readonly came: Int32Array;
  readonly g: Float64Array;
  visited = 0;
  done = false;
  found = false;

  private readonly walls: Uint8Array;
  private readonly start: number;
  private readonly goal: number;
  private readonly gx: number;
  private readonly gy: number;
  private readonly algorithm: PathfinderAlgorithm;
  private readonly diagonal: boolean;
  private readonly heap: Heap | null;
  private readonly queue: Int32Array | null;
  private qHead = 0;
  private qCount = 0;
  private seq = 0;

  constructor(
    walls: Uint8Array,
    cols: number,
    rows: number,
    start: number,
    goal: number,
    algorithm: PathfinderAlgorithm,
    diagonal: boolean,
  ) {
    const n = cols * rows;
    this.cols = cols;
    this.rows = rows;
    this.walls = walls;
    this.start = start;
    this.goal = goal;
    this.gx = goal % cols;
    this.gy = (goal - this.gx) / cols;
    this.algorithm = algorithm;
    this.diagonal = diagonal;
    this.state = new Uint8Array(n);
    this.closedAt = new Int32Array(n).fill(-1);
    this.came = new Int32Array(n).fill(-1);
    this.g = new Float64Array(n).fill(Infinity);

    if (algorithm === "bfs") {
      this.queue = new Int32Array(Math.max(1, n));
      this.heap = null;
    } else {
      this.queue = null;
      this.heap = new Heap(n >> 1);
    }

    if (start < 0 || goal < 0 || start >= n || goal >= n || walls[start] || walls[goal]) {
      this.done = true;
      return;
    }
    this.g[start] = 0;
    this.state[start] = 1;
    this.enqueue(start);
  }

  /** Heuristic distance to the goal. Admissible and consistent for both move sets. */
  h(cell: number) {
    const x = cell % this.cols;
    const dx = Math.abs(x - this.gx);
    const dy = Math.abs((cell - x) / this.cols - this.gy);
    return this.diagonal ? dx + dy + (SQRT2 - 2) * Math.min(dx, dy) : dx + dy;
  }

  private enqueue(cell: number) {
    const seq = this.seq++;
    if (this.queue) {
      this.queue[(this.qHead + this.qCount) % this.queue.length] = cell;
      this.qCount++;
      return;
    }
    const heap = this.heap as Heap;
    const g = this.g[cell];
    if (this.algorithm === "astar") {
      const h = this.h(cell);
      heap.push(cell, g + h, h, seq);
    } else if (this.algorithm === "dijkstra") {
      heap.push(cell, g, seq, 0);
    } else {
      heap.push(cell, this.h(cell), seq, 0);
    }
  }

  private next(): number {
    if (this.queue) {
      if (this.qCount === 0) return -1;
      const cell = this.queue[this.qHead];
      this.qHead = (this.qHead + 1) % this.queue.length;
      this.qCount--;
      return cell;
    }
    const heap = this.heap as Heap;
    // Lazy deletion: a cell re-queued with a better cost leaves its old entry
    // behind. The first copy out closes it; the rest are skipped here.
    for (;;) {
      const cell = heap.pop();
      if (cell < 0 || this.state[cell] !== 2) return cell;
    }
  }

  /** Expand up to `n` cells. Returns how many were expanded. */
  step(n: number): number {
    let k = 0;
    while (k < n && !this.done) {
      const u = this.next();
      if (u < 0) {
        this.done = true;
        break;
      }
      this.state[u] = 2;
      this.closedAt[u] = this.visited++;
      k++;
      if (u === this.goal) {
        this.done = true;
        this.found = true;
        break;
      }
      this.expand(u);
    }
    return k;
  }

  /** Run to the end in one go. */
  solve(): this {
    while (!this.done) this.step(0x7fffffff);
    return this;
  }

  private expand(u: number) {
    const { cols, rows, walls, state, g, came } = this;
    const x = u % cols;
    const y = (u - x) / cols;
    const dirs = this.diagonal ? 8 : 4;
    const bfs = this.algorithm === "bfs";
    const greedy = this.algorithm === "greedy";
    for (let d = 0; d < dirs; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const v = ny * cols + nx;
      if (walls[v] || state[v] === 2) continue;
      if (d >= 4 && (walls[y * cols + nx] || walls[ny * cols + x])) continue;
      const cost = g[u] + (d >= 4 ? SQRT2 : 1);
      if (state[v] === 0) {
        state[v] = 1;
        g[v] = cost;
        came[v] = u;
        this.enqueue(v);
      } else if (!bfs && cost < g[v] - 1e-9) {
        g[v] = cost;
        came[v] = u;
        // Greedy's priority ignores cost, so a cheaper route only re-points
        // the parent; the queue entry it already has is still correctly placed.
        if (!greedy) this.enqueue(v);
      }
    }
  }

  /** Cells from start to goal inclusive, or empty when there is no route. */
  path(): Int32Array {
    if (!this.found) return new Int32Array(0);
    let len = 1;
    for (let c = this.goal; c !== this.start && len <= this.visited + 1; c = this.came[c]) len++;
    const out = new Int32Array(len);
    let c = this.goal;
    for (let i = len - 1; i >= 0; i--) {
      out[i] = c;
      c = this.came[c];
    }
    return out;
  }
}
