// sandbox.js — host side of the coded-tool sandbox (the ToolSandbox intrinsic).
//
// Spawns the worker (same-origin as the page, so it is trusted host glue) and
// brokers requests to it. The worker is where untrusted tool code actually runs.

export class ToolSandbox {
  constructor({ workerUrl, trace }) {
    this.workerUrl = workerUrl;
    this.trace = trace;
    this.worker = null;
    this.seq = 0;
    this.pending = new Map();
    this.bundles = new Map(); // url -> source text (fetched once, host-side)
  }

  // Fetch the coded-tool bundle source on the trusted host side (the worker has no
  // network). If the publishing manifest declares a Subresource-Integrity digest
  // (`coded_tools.integrity`, e.g. "sha384-…"), verify it and fail closed on
  // mismatch — so a tampered or swapped peer bundle never runs.
  async _bundleSource(url, integrity) {
    if (!url) throw new Error("coded tool requested but no bundle URL is configured");
    const cacheKey = integrity ? `${url}#${integrity}` : url;
    if (this.bundles.has(cacheKey)) return this.bundles.get(cacheKey);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`failed to fetch coded-tool bundle ${url}: ${resp.status}`);
    const code = await resp.text();
    assertNoExternalImports(code, url);
    if (integrity) await verifyIntegrity(code, integrity, url);
    this.bundles.set(cacheKey, code);
    return code;
  }

  _ensure() {
    if (this.worker) return;
    this.worker = new Worker(this.workerUrl, { type: "module" });
    this.worker.onmessage = (e) => {
      const { id, kind, ok, result, slyData, error, progress, message } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      if (kind === "progress") {
        this.trace?.note("tool_progress", {
          parent: p.span,
          origin: p.origin,
          tool: p.className,
          toolKind: "coded (sandbox)",
          progress,
          message: message || "",
        });
        p.onProgress?.({ progress, message: message || "" });
        return;
      }
      this.pending.delete(id);
      if (ok) p.resolve({ result, slyData });
      else p.reject(new Error(error));
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || "sandbox worker error"));
      this.pending.clear();
    };
  }

  // Runs a coded tool. `permittedSly` is the allow-filtered sly_data slice.
  async invoke({ bundleUrl, integrity, className, args, permittedSly, origin, parentSpan, timeoutMs = 15000, onProgress }) {
    this._ensure();
    const id = ++this.seq;
    const span = this.trace?.start("tool_call", {
      parent: parentSpan,
      origin,
      tool: className,
      toolKind: "coded (sandbox)",
      args,
    });
    try {
      const bundleCode = await this._bundleSource(bundleUrl, integrity);
      const result = await new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, span, origin, className, onProgress });
        this.worker.postMessage({ id, bundleCode, cacheKey: bundleUrl, className, args, slyData: permittedSly });
        setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new Error(`coded tool '${className}' timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      });
      this.trace?.end(span, { result: result.result });
      return result; // { result, slyData }
    } catch (err) {
      this.trace?.fail(span, err);
      throw err;
    }
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}

// Best-effort early rejection of obviously non-self-contained bundles. This is NOT
// the security boundary — the worker's required CSP (default-src 'none'; script-src
// blob:; connect-src 'none'; worker-src 'none', verified at runtime in
// sandbox-worker.js) is what actually prevents module loads (even same-origin) and
// code generation. This regex just fails fast
// with a clear message on the common cases; it can be evaded (e.g. `import /*c*/(`),
// which the CSP still blocks. `export` is allowed — we read the tool classes from
// the module's exports.
function assertNoExternalImports(code, url) {
  const dynamicImport = /\bimport\s*[(.]/; // import(...) or import.meta
  const staticImport = /(^|[\n;])\s*import\b[\s"'{*]/; // import x / import{ / import" / import*
  if (dynamicImport.test(code) || staticImport.test(code)) {
    throw new Error(`coded-tool bundle ${url} must be self-contained: imports are not allowed in the sandbox.`);
  }
}

// Verify a Subresource-Integrity string ("sha256-…" / "sha384-…" / "sha512-…")
// against the fetched source. Throws (fail closed) on any mismatch.
async function verifyIntegrity(code, integrity, url) {
  const m = /^(sha(?:256|384|512))-(.+)$/.exec(String(integrity).trim());
  if (!m) throw new Error(`unsupported integrity '${integrity}' for ${url}`);
  const algo = { sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" }[m[1]];
  const digest = await crypto.subtle.digest(algo, new TextEncoder().encode(code));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  if (b64 !== m[2]) {
    throw new Error(`integrity check failed for coded-tool bundle ${url} (expected ${integrity}, got ${m[1]}-${b64})`);
  }
}
