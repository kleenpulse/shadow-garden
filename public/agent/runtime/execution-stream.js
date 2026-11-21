// execution-stream.js — public, per-turn async execution stream.
//
// TraceBus remains the complete developer/audit record. This adapter projects one
// run's trace subtree into a small, stable set of UI-safe lifecycle events while
// the normal agent return values continue to flow up the call tree.

class AsyncEventQueue {
  constructor() {
    this.values = [];
    this.waiters = [];
    this.closed = false;
    this.error = null;
  }

  push(value) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve({ value, done: false });
    else this.values.push(value);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this._flush();
  }

  fail(error) {
    if (this.closed) return;
    this.error = error instanceof Error ? error : new Error(String(error));
    this.closed = true;
    this._flush();
  }

  _flush() {
    if (this.values.length) return;
    while (this.waiters.length) {
      const waiter = this.waiters.shift();
      if (this.error) waiter.reject(this.error);
      else waiter.resolve({ value: undefined, done: true });
    }
  }

  next() {
    if (this.values.length) {
      const value = this.values.shift();
      if (!this.values.length && this.closed) this._flush();
      return Promise.resolve({ value, done: false });
    }
    if (this.error) return Promise.reject(this.error);
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  [Symbol.asyncIterator]() { return this; }
}

function preview(value, limit = 240) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

// Start a turn immediately and return an AsyncIterable of its public events.
// `runTurn` is injected to keep this adapter independent of Engine internals.
export function createTurnEventStream(trace, runTurn, streamToken) {
  const queue = new AsyncEventQueue();
  const spans = new Map();
  const included = new Set();
  let runId = null;

  const nearest = (id, kind) => {
    let current = id;
    while (current) {
      const span = spans.get(current);
      if (!span) return null;
      if (span.kind === kind) return span;
      current = span.parent;
    }
    return null;
  };

  const base = (type, ev, extra = {}) => ({
    type,
    seq: ev.seq,
    timestamp: ev.wall,
    turnId: runId,
    id: ev.id || `${type}:${ev.seq}`,
    parentId: ev.parent ?? null,
    ...extra,
  });

  const onTrace = (message) => {
    const ev = message.detail;
    if (ev.phase === "start" && ev.kind === "run" && runId === null && (!streamToken || ev.streamToken === streamToken)) {
      runId = ev.id;
      included.add(ev.id);
      spans.set(ev.id, ev);
      queue.push(base("turn.started", ev, { input: ev.input || "" }));
      return;
    }
    if (runId === null) return; // compile/startup activity before this run

    const belongs = included.has(ev.id) || (ev.parent && included.has(ev.parent));
    if (!belongs) return;
    if (ev.phase === "start" && ev.id) {
      included.add(ev.id);
      spans.set(ev.id, ev);
    } else if (ev.id && spans.has(ev.id)) {
      spans.set(ev.id, { ...spans.get(ev.id), ...ev });
    }

    const agent = nearest(ev.id || ev.parent, "agent");
    const tool = nearest(ev.id || ev.parent, "tool");
    const source = agent ? {
      origin: agent.origin,
      network: agent.network,
      agent: agent.agent,
      invocationId: agent.invocation,
    } : undefined;

    if (ev.phase === "start" && ev.kind === "agent") {
      queue.push(base("agent.started", ev, {
        source: { origin: ev.origin, network: ev.network, agent: ev.agent, invocationId: ev.invocation },
        visibility: "user",
      }));
    } else if (ev.phase === "update" && ev.kind === "model_call" && ev.streamChunk) {
      queue.push(base("agent.output.delta", ev, {
        source,
        delta: ev.streamChunk,
        // Root answer deltas are user-facing; downstream working text stays
        // available to developer consumers without leaking into the main UI.
        visibility: agent?.isTopFrontMan ? "user" : "developer",
      }));
    } else if (ev.phase === "start" && ev.kind === "tool") {
      queue.push(base("tool.started", ev, {
        source,
        tool: { name: ev.tool, callId: ev.callId, kind: ev.toolKind },
        visibility: "user",
      }));
    } else if (ev.phase === "note" && ev.kind === "tool_progress") {
      queue.push(base("tool.progress", ev, {
        source,
        tool: { name: ev.tool || tool?.tool, callId: ev.callId || tool?.callId, kind: ev.toolKind || tool?.toolKind },
        progress: ev.progress,
        message: ev.message || "",
        visibility: "user",
      }));
    } else if (ev.phase === "end" && ev.kind === "tool") {
      queue.push(base(ev.status === "error" ? "tool.failed" : "tool.completed", ev, {
        source,
        tool: { name: ev.tool, callId: ev.callId, kind: ev.toolKind },
        resultPreview: preview(ev.resultPreview || ev.error || ""),
        error: ev.status === "error" ? ev.error : undefined,
        visibility: "user",
      }));
    } else if (ev.phase === "note" && ev.kind === "agent_result") {
      queue.push(base("agent.completed", ev, {
        source: { origin: ev.origin, network: ev.network, agent: ev.agent, invocationId: ev.invocation },
        resultPreview: preview(ev.text || ""),
        visibility: "user",
      }));
    } else if (ev.phase === "end" && ev.status === "error" && ev.kind === "agent") {
      queue.push(base("agent.failed", ev, { source, error: ev.error, visibility: "user" }));
    } else if (ev.phase === "note" && ev.kind === "steering") {
      queue.push(base(ev.state === "applied" ? "turn.steering.applied" : "turn.steering.received", ev, {
        input: ev.input || "",
        count: ev.count || 1,
        visibility: "user",
      }));
    }
  };

  trace.addEventListener("event", onTrace);
  Promise.resolve().then(async () => {
    try {
      const result = await runTurn();
      queue.push({
        type: "turn.completed",
        seq: Number.MAX_SAFE_INTEGER,
        timestamp: Date.now(),
        turnId: result.turnId || runId,
        id: `${result.turnId || runId}:completed`,
        parentId: result.turnId || runId,
        result,
        visibility: "user",
      });
      queue.close();
    } catch (error) {
      queue.push({
        type: "turn.failed",
        seq: Number.MAX_SAFE_INTEGER,
        timestamp: Date.now(),
        turnId: runId,
        id: `${runId || "turn"}:failed`,
        parentId: runId,
        error: String(error?.message || error),
        visibility: "user",
      });
      queue.fail(error);
    } finally {
      trace.removeEventListener("event", onTrace);
    }
  });
  return queue;
}
