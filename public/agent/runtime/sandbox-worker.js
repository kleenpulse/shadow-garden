// sandbox-worker.js — runs untrusted coded-tool code in an isolated module worker.
//
// Peer coded tools are treated as UNTRUSTED public code. The worker has no access
// to the host's BYOK store, DOM, or storage, and no network: all ambient network
// APIs are disabled below BEFORE any tool code is evaluated, and the bundle is
// loaded from host-fetched source via a blob URL (not a live fetch the tool could
// intercept). The host (sandbox.js) additionally rejects any bundle containing a
// static or dynamic `import`, since module loading would otherwise fetch code from
// another origin independently of the disabled fetch API. Together these mean a
// malicious coded tool cannot reach the network to exfiltrate the sly_data it is
// handed. Authenticated backend (REST) calls are made by the trusted host instead.

// Disable every ambient network API in the worker global scope. Done at module top
// level, so it is in effect before the untrusted bundle module is ever evaluated.
const denyNetwork = () => {
  throw new Error("network access is not available to coded tools");
};
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "sendBeacon", "Request", "Response"]) {
  try {
    Object.defineProperty(self, name, { value: denyNetwork, writable: false, configurable: false });
  } catch {
    /* some engines mark these non-configurable; best-effort */
  }
}

// The REAL isolation boundary is a Content-Security-Policy served on this worker:
//   default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'
// `script-src blob:` (deliberately NOT 'self') lets the worker import only the
// host-created blob module — a tool cannot trigger even a same-origin module request
// (e.g. import('/x?data=secret')) to exfiltrate data. The absence of 'unsafe-eval'
// also blocks eval/Function AND the in-realm `(fn).constructor.constructor` code-gen
// path that JS itself cannot lock down; connect-src/worker-src 'none' block fetch
// and nested workers.
// Probe for it using the genuine Function constructor (reached via .constructor, so
// the probe reflects the actual CSP, not our defense-in-depth overrides below). If
// code generation succeeds, the host did NOT apply the required CSP — we refuse to
// run untrusted tools (checked in onmessage), making the CSP a hard requirement.
let CSP_BLOCKS_CODEGEN = false;
try { (function () {}).constructor("return 1")(); } catch { CSP_BLOCKS_CODEGEN = true; }

// Defense-in-depth: neutralize ambient dynamic code generation for environments
// where CSP is only partially applied. (Cannot stop (fn).constructor in-realm —
// that is what the CSP probe above is for.)
const denyEval = () => { throw new Error("dynamic code evaluation is not available to coded tools"); };
try { Object.defineProperty(self, "eval", { value: denyEval, writable: false, configurable: false }); } catch {}
try { Object.defineProperty(self, "Function", { value: denyEval, writable: false, configurable: false }); } catch {}
for (const timer of ["setTimeout", "setInterval"]) {
  const orig = self[timer];
  if (typeof orig === "function") {
    try {
      Object.defineProperty(self, timer, {
        value: function (fn, ...rest) { if (typeof fn === "string") denyEval(); return orig.call(self, fn, ...rest); },
        writable: false, configurable: false,
      });
    } catch { /* best-effort */ }
  }
}

const cache = new Map();

function progressValue(value) {
  if (value == null || ["string", "number", "boolean"].includes(typeof value)) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}

self.onmessage = async (e) => {
  const { id, bundleCode, cacheKey, className, args, slyData } = e.data;
  try {
    if (!CSP_BLOCKS_CODEGEN) {
      throw new Error(
        "coded-tool sandbox requires a Content-Security-Policy without 'unsafe-eval'. " +
        "Serve runtime/sandbox-worker.js with: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'. " +
        "Refusing to run untrusted tool code."
      );
    }
    const key = cacheKey || className;
    let mod = cache.get(key);
    if (!mod) {
      if (typeof bundleCode !== "string") throw new Error("no coded-tool bundle source provided");
      // Import from a blob built from host-fetched source. Blob-module loading does
      // not use the (now-disabled) global fetch, so the tool still loads but cannot
      // reach the network at evaluation time or afterward.
      const blobUrl = URL.createObjectURL(new Blob([bundleCode], { type: "text/javascript" }));
      try {
        mod = await import(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      cache.set(key, mod);
    }
    const ToolClass = resolveClass(mod, className);
    if (!ToolClass) throw new Error(`coded tool class '${className}' not found`);
    const tool = new ToolClass();
    const sly = { ...(slyData || {}) };
    const callArgs = { ...(args || {}) };
    // Match neuro-san's progress_reporter convention while keeping a small set
    // of ergonomic JS aliases. Reports are lifecycle data, not final tool output.
    const report = (progress, message = "") => {
      self.postMessage({ id, kind: "progress", progress: progressValue(progress), message: String(message || "") });
    };
    if (!("progress_reporter" in callArgs)) {
      callArgs.progress_reporter = {
        report,
        async reportProgress(progress, message = "") { report(progress, message); },
        async async_report_progress(progress, message = "") { report(progress, message); },
      };
    }
    let result;
    if (typeof tool.asyncInvoke === "function") result = await tool.asyncInvoke(callArgs, sly);
    else if (typeof tool.invoke === "function") result = await tool.invoke(callArgs, sly);
    else throw new Error(`coded tool '${className}' implements neither asyncInvoke nor invoke`);
    self.postMessage({ id, ok: true, result, slyData: sly });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};

// Supports "module.Class" or just "Class".
function resolveClass(mod, className) {
  const leaf = className.includes(".") ? className.split(".").pop() : className;
  if (mod[leaf]) return mod[leaf];
  if (mod.default && mod.default[leaf]) return mod.default[leaf];
  if (mod[className]) return mod[className];
  return null;
}
