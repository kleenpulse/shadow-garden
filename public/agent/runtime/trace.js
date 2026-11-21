// trace.js — the structured execution-trace event bus.
//
// Every boundary in the runtime (compile, model call, tool call, remote
// fetch-and-run, REST call, stream chunk, error, retry) emits a span here. The
// bus powers the live graph, the chronological log, and the JSON export
// ("HAR for agents"). It is platform glue (an intrinsic), not kernel logic.

let SEQ = 0;

export class TraceBus extends EventTarget {
  constructor() {
    super();
    this.events = [];
    this.spans = new Map();
  }

  _emit(ev) {
    ev.seq = SEQ++;
    ev.t = performance.now();
    ev.wall = Date.now();
    this.events.push(ev);
    this.dispatchEvent(new CustomEvent("event", { detail: ev }));
  }

  // Open a span; returns an id used to close it.
  start(kind, fields = {}) {
    const id = `s${SEQ}`;
    const span = { id, kind, parent: fields.parent ?? null, status: "running", ...fields };
    span.startedAt = performance.now();
    this.spans.set(id, span);
    this._emit({ phase: "start", ...span });
    return id;
  }

  // Attach incremental info to a running span (e.g. a stream chunk).
  // Emits the full merged span so each event is self-contained for the UI.
  update(id, fields = {}) {
    const span = this.spans.get(id);
    if (!span) return;
    Object.assign(span, fields);
    this._emit({ phase: "update", ...span, ...fields });
  }

  end(id, fields = {}) {
    const span = this.spans.get(id);
    if (!span) return;
    Object.assign(span, fields, { status: fields.status || "ok" });
    span.durationMs = performance.now() - (span.startedAt ?? performance.now());
    this._emit({ phase: "end", ...span });
  }

  fail(id, error) {
    this.end(id, { status: "error", error: String(error && error.message ? error.message : error) });
  }

  // A point-in-time event with no duration (e.g. progress, info).
  note(kind, fields = {}) {
    this._emit({ phase: "note", kind, ...fields });
  }

  export() {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      events: this.events,
    };
  }
}
