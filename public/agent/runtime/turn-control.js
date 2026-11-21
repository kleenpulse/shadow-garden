// turn-control.js — cooperative input channel for one running agent turn.
//
// Steering is deliberately scoped to the top-level orchestrator. Work already
// handed to tools or downstream agents is allowed to finish, avoiding duplicate
// side effects. The top agent can interrupt an in-flight model call, incorporate
// the new user input, and decide what to do with those results when they arrive.

export class TurnControl {
  constructor() {
    this.pending = [];
    this.accepted = [];
    this.watchers = new Set();
    this.closed = false;
    this.trace = null;
    this.parentSpan = null;
    this.tracedCount = 0;
  }

  attach(trace, parentSpan) {
    this.trace = trace;
    this.parentSpan = parentSpan;
    for (const input of this.accepted.slice(this.tracedCount)) this._traceReceived(input);
    this.tracedCount = this.accepted.length;
  }

  _traceReceived(input) {
    this.trace?.note("steering", {
      parent: this.parentSpan,
      state: "received",
      input: input.text,
    });
  }

  steer(value) {
    const text = String(value || "").trim();
    if (!text || this.closed) return false;
    const input = { text, receivedAt: Date.now() };
    this.pending.push(input);
    this.accepted.push(input);
    if (this.trace) {
      this._traceReceived(input);
      this.tracedCount = this.accepted.length;
    }
    for (const resolve of this.watchers) resolve();
    this.watchers.clear();
    return true;
  }

  drain() {
    if (!this.pending.length) return [];
    return this.pending.splice(0);
  }

  watch() {
    if (this.pending.length || this.closed) {
      return { promise: Promise.resolve(), cancel() {} };
    }
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    this.watchers.add(resolve);
    return {
      promise,
      cancel: () => this.watchers.delete(resolve),
    };
  }

  applied(inputs) {
    if (!inputs?.length) return;
    this.trace?.note("steering", {
      parent: this.parentSpan,
      state: "applied",
      count: inputs.length,
      input: inputs.map((item) => item.text).join("\n"),
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.watchers) resolve();
    this.watchers.clear();
  }
}

// Race an in-flight top-agent model call against new steering. The operation is
// expected to honor AbortSignal (both the direct fetch client and LangChain do).
// Tool calls never use this helper and therefore are not replayed on steering.
export async function runInterruptibleModelCall(turnControl, invoke) {
  if (!turnControl) return { interrupted: false, value: await invoke(undefined) };

  const abort = new AbortController();
  const watch = turnControl.watch();
  const operation = Promise.resolve().then(() => invoke(abort.signal));
  const settled = operation.then(
    (value) => ({ kind: "result", value }),
    (error) => ({ kind: "error", error }),
  );
  try {
    const winner = await Promise.race([
      settled,
      watch.promise.then(() => ({ kind: "steering" })),
    ]);
    if (winner.kind === "steering" && turnControl.pending.length) {
      abort.abort(new DOMException("Model call superseded by user steering", "AbortError"));
      // The fetch/stream normally settles immediately after abort. Do not make
      // steering wait on a non-compliant provider; the handler prevents an
      // abandoned rejection from becoming unhandled.
      settled.then(() => {});
      return { interrupted: true };
    }
    if (winner.kind === "steering") {
      const completed = await settled;
      if (completed.kind === "error") throw completed.error;
      return { interrupted: false, value: completed.value };
    }
    if (winner.kind === "error") throw winner.error;
    return { interrupted: false, value: winner.value };
  } finally {
    watch.cancel();
  }
}

export function applyPendingSteering(turnControl, append) {
  const inputs = turnControl?.drain() || [];
  for (const input of inputs) append(input.text);
  turnControl?.applied(inputs);
  return inputs.length;
}
