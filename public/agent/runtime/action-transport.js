// Changed by agentic-web. See README.md in this folder for what changed.
import { ActionRegistry, cloneData, validateData } from "./actions.js";
import { registerFormActions, watchHostForms } from "./form-actions.js";
import { loadDiscoveredActions } from "./discovered-actions.js";

const protocol = "nsdeploy-actions-v1";
export function sameOriginAsset(base, path) {
  const url = new URL(path, `${base.replace(/\/$/, "")}/`);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== new URL(base).origin || url.username || url.password) throw new Error("Action assets must belong to their publishing origin.");
  return url.href;
}
export async function loadActionModule(registry, scope, manifest, { bridge = false } = {}) {
  if (!manifest.actions) return;
  if (new URL(scope.base).origin !== location.origin) throw new Error("Executable action adapters must run on their own origin.");
  if (manifest.actions.version !== 1) throw new Error("Unsupported action protocol.");
  const actions = { register: definition => registry.register(scope, definition) };
  if (manifest.actions.catalog) await loadDiscoveredActions(actions, sameOriginAsset(scope.base, manifest.actions.catalog), manifest.actions.callerOrigins || []);
  for (const path of new Set([manifest.actions.module, ...(manifest.actions.modules || [])].filter(Boolean))) {
    const module = await import(sameOriginAsset(scope.base, path));
    if (typeof module.registerActions !== "function") throw new Error("Action modules must export registerActions.");
    await module.registerActions(actions);
  }
  await registerFormActions(actions, {
    pages: manifest.actions.pages || [], callerOrigins: manifest.actions.callerOrigins || [], base: scope.base,
    report: issue => { registry.discoveryIssues.push({ ...scope, ...issue }); console.warn("Action discovery:", issue); },
  });
  if (manifest.actions.hostPage && !bridge) {
    registry.hostForms?.dispose();
    registry.hostForms = watchHostForms(registry, scope, { onChange: () => registry.onChange?.() });
  }
  if (!registry.catalog(scope).length && !(manifest.actions.hostPage && !bridge)) {
    registry.discoveryIssues.push({ ...scope, page: "Action sources", reason: "No website actions connected. Check configured routes/modules on the actual application origin; a generated agent page supplies no business actions." });
  }
}

// Used by both the local UI and the trusted, first-party bridge popup.
export function reviewActions(items, title = "Review actions") {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = "max-width:640px;width:85%;max-height:85vh;overflow:auto;border:1px solid #888;border-radius:12px;padding:24px;font:16px system-ui";
    const heading = document.createElement("h2"); heading.textContent = title;
    // Start at the top of the dialog, on an element that Enter cannot activate.
    heading.tabIndex = -1; heading.autofocus = true;
    const details = document.createElement("pre"); details.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere";
    details.textContent = items.map(i => `${i.action} — ${i.origin} (${i.effect})\n${i.description || ""}\n${JSON.stringify(i.arguments, null, 2)}`).join("\n\n");
    const yes = document.createElement("button"); yes.textContent = "Confirm actions";
    const no = document.createElement("button"); no.textContent = "Cancel";
    // close() returns focus to where the visitor was, such as the chat input.
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    yes.onclick = () => finish(true); no.onclick = () => finish(false);
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
    dialog.append(heading, details, yes, no); document.body.append(dialog); dialog.showModal();
  });
}

// The chat may ask in its own messages before a partner's window opens, naming the
// partner. The prompt must call window.open in the visitor's click and resolve with it.
let actionWindowPrompt = null;
export function setActionWindowPrompt(prompt) { actionWindowPrompt = prompt; }

function openActionWindow(url, signal, brand) {
  if (actionWindowPrompt) return actionWindowPrompt({ url, origin: new URL(url).origin, brand, signal });
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Action was cancelled.")); return; }
    const dialog = document.createElement("dialog");
    const text = document.createElement("p"); text.textContent = `Continue at ${new URL(url).origin} to authorize this action. Sign in there if needed.`;
    const open = document.createElement("button"); open.textContent = "Open action site";
    const cancel = document.createElement("button"); cancel.textContent = "Cancel";
    const cleanup = () => { dialog.close(); dialog.remove(); signal?.removeEventListener("abort", stop); };
    const stop = () => { cleanup(); reject(new Error("Action window cancelled; action not started.")); };
    open.onclick = () => {
      const popup = window.open(url, "_blank", "popup,width=700,height=650");
      if (!popup) { text.textContent = "Allow popups for this page, then try again."; return; }
      cleanup(); resolve(popup);
    };
    cancel.onclick = stop;
    signal?.addEventListener("abort", stop, { once: true });
    dialog.addEventListener("cancel", e => { e.preventDefault(); stop(); });
    dialog.append(text, open, cancel); document.body.append(dialog); dialog.showModal();
  });
}

export class ActionBridgeClient {
  constructor(url, brand) { this.url = url; this.brand = brand; this.pending = new Map(); this.seq = 0; }
  async connect(popup = false, signal) {
    if (this.port) return;
    const origin = new URL(this.url).origin;
    // Register listener before window.open; the bridge repeatedly announces ready
    // until connected, avoiding races while the user opens its popup.
    let peer;
    const ready = new Promise((resolve, reject) => {
      this.rejectHandshake = reject;
      this.handshakeCleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
      const receive = event => {
        if (event.source !== peer || event.origin !== origin || event.data?.protocol !== protocol || event.data?.type !== "ready") return;
        const channel = new MessageChannel();
        this.port = channel.port1;
        this.port.onmessage = ({ data }) => {
          const p = this.pending.get(data?.id);
          if (!p) return;
          this.pending.delete(data.id); clearTimeout(p.timer);
          data.ok ? p.resolve(data.value) : p.reject(new Error(data.error));
        };
        peer.postMessage({ protocol, type: "connect" }, origin, [channel.port2]);
        this.handshakeCleanup(); this.rejectHandshake = null; resolve();
      };
      const timer = setTimeout(() => { this.handshakeCleanup(); reject(new Error("Action bridge unavailable. Check framing policy, callerOrigins and login; no action was sent.")); }, popup ? 120000 : 10000);
      window.addEventListener("message", receive);
    });
    // Attach rejection immediately even while waiting for the user's click.
    ready.catch(() => {});
    try {
      if (popup) { peer = await openActionWindow(this.url, signal, this.brand); this.popup = peer; }
      else {
        this.frame = document.createElement("iframe");
        this.frame.hidden = true; this.frame.title = "Site action bridge";
        this.frame.sandbox = "allow-scripts allow-same-origin";
        this.frame.src = this.url; document.body.append(this.frame); peer = this.frame.contentWindow;
      }
      await ready;
      if (this.popup) this.closeWatch = setInterval(() => { if (this.popup.closed) this.dispose(); }, 500);
    } catch (error) { this.dispose(); throw error; }
  }
  request(type, payload = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Action response timed out; outcome unknown. Check the site before retrying.")); }, type === "execute" ? 180000 : 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.port.postMessage({ ...cloneData(payload), id, type });
    });
  }
  dispose() {
    clearInterval(this.closeWatch);
    this.rejectHandshake?.(new Error("Action bridge closed.")); this.rejectHandshake = null;
    this.handshakeCleanup?.(); this.port?.close(); this.port = null;
    this.frame?.remove(); this.popup?.close();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("Action bridge closed; outcome unknown.")); }
    this.pending.clear();
  }
}

export async function registerRemoteActions(registry, scope, manifest) {
  if (!manifest.actions) return;
  if (manifest.actions.version !== 1) throw new Error("Unsupported action protocol.");
  const url = sameOriginAsset(scope.base, manifest.actions.bridge);
  registry.remoteLoads ||= new Map();
  const key = `${scope.base}::${scope.network}`;
  if (registry.remoteLoads.has(key)) return registry.remoteLoads.get(key);
  const loading = discoverRemoteActions(registry, scope, url, manifest.brand);
  registry.remoteLoads.set(key, loading);
  try { await loading; } catch (error) { registry.remoteLoads.delete(key); throw error; }
  finally { registry.onChange?.(); }
}

async function discoverRemoteActions(registry, scope, url, brand) {
  const client = new ActionBridgeClient(url, brand);
  const registered = [];
  try {
    try { await client.connect(); }
    catch { await client.connect(true); } // explicit user-opened fallback for framing restrictions
    const catalog = await client.request("catalog");
    if (!Array.isArray(catalog) || catalog.length > 100) throw new Error("Invalid remote action catalog.");
    if (!catalog.length) registry.discoveryIssues.push({ ...scope, page: "Remote action bridge", reason: "No actions exposed to this caller. Check the remote site's action sources and callerOrigins; host-page forms are local only." });
    for (const definition of catalog) registered.push(registry.register(scope, definition, async (args, { requestId, signal }) => {
      // Mutations are approved on the owning origin in a top-level window. The
      // receiving bridge enforces this independently of the caller's catalog.
      const executor = new ActionBridgeClient(url, brand);
      const abort = () => executor.dispose();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        if (signal?.aborted) throw new Error("Action was cancelled.");
        await executor.connect(definition.effect !== "read" || definition.availability === "top-level", signal);
        if (signal?.aborted) throw new Error("Action was cancelled.");
        return await executor.request("execute", { name: definition.name, args, requestId });
      } finally { signal?.removeEventListener("abort", abort); executor.dispose(); }
    }));
  } catch (error) {
    for (const ref of registered) registry.entries.delete(ref);
    throw error;
  } finally { client.dispose(); }
}

export async function serveActionBridge() {
  const base = new URL("./", location.href).href.replace(/\/$/, "");
  const response = await fetch(`${base}/agent-manifest.json`);
  if (!response.ok) throw new Error("Cannot load action manifest.");
  const manifest = await response.json();
  const registry = new ActionRegistry();
  const scope = { base, network: manifest.networks[0].name };
  await loadActionModule(registry, scope, manifest, { bridge: true });
  const peer = window.opener || (window.parent !== window ? window.parent : null);
  if (!peer) { document.body.append("Open this page through an agent action."); return; }
  let connected = false;
  const ready = () => { if (!connected) peer.postMessage({ protocol, type: "ready" }, "*"); }; // readiness only, no data
  const interval = setInterval(ready, 250); ready();
  window.addEventListener("pagehide", () => clearInterval(interval), { once: true });
  window.addEventListener("message", event => {
    if (connected || event.source !== peer || event.origin === "null" || event.data?.protocol !== protocol || event.data?.type !== "connect" || event.ports.length !== 1) return;
    connected = true; clearInterval(interval);
    const caller = event.origin;
    const allowed = [...registry.entries.values()].filter(e => e.availability !== "local-only" && (e.callerOrigins.includes(caller) || e.callerOrigins.includes("*")));
    const port = event.ports[0]; const seen = new Set(); let busy = false;
    port.onmessage = async ({ data }) => {
      const id = data?.id;
      if (!Number.isSafeInteger(id)) return;
      try {
        const request = cloneData(data);
        if (request.type === "catalog") {
          const value = allowed.map(({ name, description, inputSchema, outputSchema, effect, availability }) => ({ name, description, inputSchema, outputSchema, effect, availability }));
          port.postMessage({ id, ok: true, value }); return;
        }
        if (request.type !== "execute" || busy) throw new Error("Invalid or concurrent action request.");
        const entry = allowed.find(e => e.name === request.name);
        if (!entry) throw new Error("Action is not exposed to this caller.");
        if (entry.effect !== "read" || entry.availability === "top-level") {
          if (window.top !== window || !window.opener) throw new Error("This action requires its own confirmation window.");
        }
        if (typeof request.requestId !== "string" || request.requestId.length > 200 || seen.has(request.requestId)) throw new Error("Invalid or repeated request ID.");
        validateData(entry.inputSchema, request.args);
        busy = true;
        try {
          // An action that shows its own confirmation in this window skips the generic dialog.
          if (entry.effect !== "read" && !entry.confirmsInWindow && !await reviewActions([{ action: entry.name, description: entry.description, origin: location.origin, effect: entry.effect, arguments: request.args }], `Request from ${caller}`)) throw new Error("User declined; action not started.");
          seen.add(request.requestId);
          const value = cloneData(await entry.execute(request.args, { requestId: request.requestId, callerOrigin: caller }));
          if (entry.outputSchema) validateData(entry.outputSchema, value, "result");
          port.postMessage({ id, ok: true, value });
        } finally { busy = false; }
      } catch (error) { port.postMessage({ id, ok: false, error: String(error.message || error) }); }
    };
    port.start();
  });
}
