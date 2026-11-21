// Changed by agentic-web. See README.md in this folder for what changed.
// engine.js — top-level orchestration: load a published network from an origin,
// compile it (HOCON -> filter chain -> validate -> AgentNetwork), and run it. Owns
// the intrinsics (LLM client, sandbox, trace) and implements resolveRemote, the
// fetch-and-run-locally bridge that turns a peer URL into a runnable Session.

import { parseHocon } from "./hocon.js";
import { AgentNetwork, validateNetwork, parseExternalAgent, redactSlyData, ChatMessageType } from "./kernel.js";
import { LlmClient } from "./llm.js";
import { ToolSandbox } from "./sandbox.js";
import { TraceBus } from "./trace.js";
import { fetchManifest, fetchText, resolveUrl, RemoteRegistry } from "./remote.js";
import { runAgent } from "./runner.js";
import { McpClient } from "./mcp.js";
import { fallbackModel, normalizeModelName } from "./model.js";
import { interactionMessage } from "./cruse.js";
import { createTurnEventStream } from "./execution-stream.js";
import { TurnControl } from "./turn-control.js";
import { ActionRegistry, actionBindings, cloneData } from "./actions.js";
import { loadActionModule, registerRemoteActions } from "./action-transport.js";
import { randomUuid } from "./web-crypto.js";

function normOrigin(url) {
  try { return new URL(url).origin; } catch { return String(url || ""); }
}

function sameRouter(left, right) {
  try {
    const normalize = (value) => {
      const url = new URL(value);
      const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
      const host = loopback ? "loopback" : url.hostname.toLowerCase();
      return `${url.protocol}//${host}:${url.port}${url.pathname.replace(/\/$/, "")}${url.search}`;
    };
    return normalize(left) === normalize(right);
  } catch {
    return String(left || "").replace(/\/$/, "") === String(right || "").replace(/\/$/, "");
  }
}

export async function isPublishedMockRouter(router, fetchImpl = fetch) {
  try {
    const url = new URL(router);
    const response = await fetchImpl(`${url.origin}/agent-manifest.json`, { cache: "no-store" });
    if (!response.ok) return false;
    const manifest = await response.json();
    const declared = manifest?.llm_router || {};
    return declared.mock === true && sameRouter(router, declared.base_url);
  } catch {
    return false;
  }
}

export function selectTopRouter(manifest, routerOverride, byokKey, modelOverride = "") {
  const declared = manifest?.llm_router || {};
  const hasRealKey = !!(byokKey && byokKey !== "demo");
  const hasExplicitModel = !!String(modelOverride || "").trim();
  let requested = String(routerOverride || "").replace(/\/$/, "");
  const requestedMock = requested && declared.mock === true && sameRouter(requested, declared.base_url);

  if ((hasRealKey || hasExplicitModel) && (!requested || requestedMock)) {
    if (!declared.byok_router) {
      throw new Error("A real API key is configured, but this site publishes no AI provider route.");
    }
    requested = declared.byok_router;
    return { baseUrl: requested, mock: false, upgradedToByok: true };
  }
  if (requested) {
    return { baseUrl: requested, mock: declared.mock === true && sameRouter(requested, declared.base_url), upgradedToByok: false };
  }
  return { baseUrl: declared.base_url || "", mock: declared.mock === true, upgradedToByok: false };
}

export function manifestAllowsPeer(target, manifest, runtimeAllowedPeers = new Set()) {
  const targetOrigin = normOrigin(target);
  const policy = manifest?.peer_policy || manifest?.web_policy;
  if (policy?.mode === "open") {
    let parsed;
    try { parsed = new URL(target); } catch { return false; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const denied = (policy.deny_origins || policy.denied_origins || []).map(normOrigin);
    if (denied.includes(targetOrigin)) return false;
    return true;
  }
  const declared = (manifest?.allowed_peers || []).map(normOrigin);
  return declared.includes(targetOrigin) || runtimeAllowedPeers.has(targetOrigin);
}

export function selectPeerRouter(callerRouter) {
  if (!callerRouter?.baseUrl) {
    throw new Error("The caller has no active LLM router to use for this peer network.");
  }
  return { baseUrl: callerRouter.baseUrl, mock: callerRouter.mock === true };
}

export class Engine {
  constructor({ originUrl, trace, sandboxWorkerUrl, byokKey, routerOverride } = {}) {
    this.originUrl = (originUrl || (typeof location !== "undefined" ? location.origin : "")).replace(/\/$/, "");
    this.trace = trace || new TraceBus();
    this.sandboxWorkerUrl = sandboxWorkerUrl || "/runtime/sandbox-worker.js";
    this.byokKey = byokKey || "";
    this.routerOverride = routerOverride || "";
    this.modelOverride = normalizeModelName(arguments[0] && arguments[0].modelOverride);
    this.registry = new RemoteRegistry({ trace: this.trace });
    this.sandbox = new ToolSandbox({ workerUrl: this.sandboxWorkerUrl, trace: this.trace });
    this.top = null; // {network, base, bundleUrl, manifest, llm}
    this.agentRunner = null; // set by enableLangChain(); neuro-san-web owns the loop
    this.history = []; // top-level conversation turns ([{role,content}]) across runs
    this.consent = new Map(); // peerOrigin -> "always" (remembered approvals)
    this.consentTail = Promise.resolve(); // serialize modal decisions for parallel tools
    this.onConsent = null; // UI hook: async (info) => "allow"|"always"|"decline"
    this.onLinkRequired = null; // UI hook: async ({reference,...}) => peer URL|null
    this.runtimeAllowedPeers = new Set(); // user-entered, validated link origins
    this.streamSequence = 0;
    this.actions = new ActionRegistry();
    this.actionPresentations = new Map();
    this.actionSubmissions = new Map();
    this.onActionConfirm = async () => false;
  }

  // Clear the multi-turn conversation history (start a new chat).
  resetHistory() {
    this.history = [];
    this.actionPresentations.clear();
    this.actionSubmissions.clear();
  }

  // Ask the user to approve contacting another hosted network. Remembers
  // "always" per origin; defaults to allow when no UI hook is attached (headless).
  async requestConsent(info) {
    const decide = async () => {
      if (this.consent.get(info.peerOrigin) === "always") return "allow";
      if (typeof this.onConsent !== "function") return "allow";
      const decision = await this.onConsent(info);
      if (decision === "always") { this.consent.set(info.peerOrigin, "always"); return "allow"; }
      return decision || "allow";
    };
    const pending = this.consentTail.then(decide, decide);
    this.consentTail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  // Load the prebuilt LangChain.js AgentRunner bundle and use it as the loop.
  async enableLangChain() {
    const mod = await import("./generated/agent-runner.bundle.js");
    this.agentRunner = mod.runAgentLangChain || mod.default;
    return this.agentRunner;
  }

  // Compile the origin's own published front network.
  async loadTop() {
    const span = this.trace.start("compile", { origin: hostOf(this.originUrl), what: "top network" });
    try {
      const { manifest, base } = await fetchManifest(this.originUrl);
      const entry = manifest.networks[0];
      // Set manifest early so resolveRemote/resolveMcp policy checks have it.
      this.top = { manifest, base };
      const hasConfiguredModel = !!String(this.modelOverride || "").trim();
      const hasRealKey = !!(this.byokKey && this.byokKey !== "demo");
      if ((hasConfiguredModel || hasRealKey) && this.routerOverride
          && !sameRouter(this.routerOverride, manifest.llm_router?.base_url)
          && await isPublishedMockRouter(this.routerOverride)) {
        const oldRouter = this.routerOverride;
        this.routerOverride = manifest.llm_router?.byok_router || "";
        this.trace.note("router_correction", {
          origin: hostOf(base), from: oldRouter, to: this.routerOverride,
          reason: "saved router is another nsDeploy site's published mock endpoint",
        });
      }
      const { network, bundleUrl, integrity, llm, validation: v } = await this._compile(base, manifest, entry, { isTop: true });
      this.top = { network, base, bundleUrl, integrity, manifest, llm };
      const loadActions = typeof location !== "undefined" && new URL(base).origin !== location.origin
        ? registerRemoteActions : loadActionModule;
      await loadActions(this.actions, { base, network: network.name }, manifest);
      this.trace.note("action_catalog", { count: this.actions.catalog({ base, network: network.name }).length,
        issues: this.actions.discoveryIssues });
      this.mockLLM = llm.mock; // true when using the deterministic mock router
      this.byokRouter = manifest.llm_router?.byok_router || ""; // real-LLM proxy for BYOK keys
      this.trace.end(span, {
        network: network.name,
        frontMan: network.findFrontMan(),
        errors: v.errors,
        warnings: v.warnings,
        peers: v.externals || [],
      });
      return { network, manifest, validation: v };
    } catch (err) {
      this.trace.fail(span, err);
      throw err;
    }
  }

  async _compile(base, manifest, entry, { isTop = false } = {}) {
    const hoconUrl = resolveUrl(base, entry.hocon);
    const text = await fetchText(hoconUrl);
    const config = parseHocon(text);
    const publishedLinks = await this._loadPublishedLinks(base, entry.name || entry.hocon);
    config.links = { ...(config.links || {}), ...publishedLinks };
    const network = new AgentNetwork(config, entry.name || entry.hocon);
    // Validation gate: a network with structural errors must never run. (Warnings
    // are non-fatal and surfaced in the trace/UI.) This applies to the top network
    // AND to every fetched-and-run peer network compiled below.
    const validation = validateNetwork(network);
    if (validation.errors && validation.errors.length) {
      throw new Error(`Network '${network.name}' (${hostOf(base)}) failed validation: ${validation.errors.join("; ")}`);
    }
    const bundleUrl = manifest.coded_tools?.bundle ? resolveUrl(base, manifest.coded_tools.bundle) : null;
    const integrity = manifest.coded_tools?.integrity || null; // optional SRI digest
    // LLM routing boundary. The top site chooses the active router. Peer manifests
    // contribute network definitions only and can never redirect execution or keys.
    let routerBase;
    let mock;
    if (isTop) {
      const selected = selectTopRouter(manifest, this.routerOverride, this.byokKey, this.modelOverride);
      routerBase = selected.baseUrl;
      mock = selected.mock;
      this.routerOverride = selected.upgradedToByok ? routerBase : this.routerOverride;
      this.userRouter = { baseUrl: routerBase, mock };
    } else {
      // A peer contributes its network definition, not its execution environment.
      // It always runs in this browser with the top caller's active router, even
      // for keyless/mock sessions. Never send execution or a BYOK key to the peer.
      const selected = selectPeerRouter(this.userRouter);
      routerBase = selected.baseUrl;
      mock = selected.mock;
    }
    const llm = new LlmClient({ baseUrl: routerBase, apiKey: this.byokKey, trace: this.trace, mock });
    return { network, bundleUrl, integrity, llm, hoconUrl, validation };
  }

  // Every hop is constrained by the immediate caller's published manifest. The
  // user still approves each remote call, so a peer cannot silently expand access.
  _assertAllowedPeer(target, sourceManifest) {
    const manifest = sourceManifest || this.top?.manifest;
    if (!manifestAllowsPeer(target, manifest, this.runtimeAllowedPeers)) {
      const source = manifest?.networks?.[0]?.name || "calling network";
      throw new Error(`Policy: ${hostOf(target)} is not in ${source}'s allowed_peers; refusing to contact it.`);
    }
  }

  async _loadPublishedLinks(base, networkName) {
    try {
      const resp = await fetch(resolveUrl(base, "/links.json"), { cache: "no-store" });
      if (!resp.ok) return {};
      const doc = await resp.json();
      return doc?.networks?.[networkName] || {};
    } catch {
      return {};
    }
  }

  _linkKey(base, networkName, reference) {
    return `nsdeploy-link-v1::${base}::${networkName}::${reference}`;
  }

  _storedLink(base, networkName, reference) {
    try { return localStorage.getItem(this._linkKey(base, networkName, reference)) || ""; }
    catch { return ""; }
  }

  async _persistLink(base, networkName, reference, target) {
    try { localStorage.setItem(this._linkKey(base, networkName, reference), target); } catch {}
    if (this.top?.manifest?.deployment?.mode === "static") return;
    try {
      await fetch(resolveUrl(base, "/_nsdeploy/links"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: networkName, reference, target }),
      });
    } catch {
      // Static hosts have no mutable endpoint; browser-local persistence remains.
    }
  }

  async _normalizeLinkTarget(reference, rawTarget) {
    let parsed;
    try { parsed = new URL(String(rawTarget || "").trim()); }
    catch { throw new Error("Enter a complete http:// or https:// nsDeploy site URL."); }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Linked network URLs must use http or https.");
    }
    const requested = parsed.pathname.endsWith("/") ? "" : parsed.pathname.split("/").filter(Boolean).pop() || "";
    const origin = (requested ? new URL("./", parsed).href : `${parsed.origin}${parsed.pathname}`).replace(/\/$/, "");
    const { manifest } = await fetchManifest(origin);
    const networks = manifest.networks || [];
    const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    let entry = requested ? networks.find((item) => item.name === requested) : null;
    if (!entry) entry = networks.find((item) => norm(item.name) === norm(reference));
    if (!entry) {
      const matchedExport = (manifest.linking?.exports || []).find((item) =>
        (item.aliases || []).some((alias) => norm(alias) === norm(reference))
      );
      if (matchedExport) entry = networks.find((item) => item.name === matchedExport.network);
    }
    if (!entry && networks.length === 1) entry = networks[0];
    if (!entry) {
      const choices = networks.map((item) => item.name).join(", ") || "none";
      throw new Error(`No unique network matching '${reference}' at ${origin}. Published networks: ${choices}.`);
    }
    return `${origin}/${entry.name}`;
  }

  async resolveLink(reference, network, base, parentSpan) {
    let target = network.getLink(reference) || this._storedLink(base, network.name, reference);
    let needsValidation = false;
    if (!target) {
      if (typeof this.onLinkRequired !== "function") {
        throw new Error(`Agent-network link '${reference}' is unresolved. Supply a peer nsDeploy URL.`);
      }
      target = await this.onLinkRequired({
        reference,
        sourceNetwork: network.name,
        sourceOrigin: base,
        parentSpan,
      });
      if (!target) return null;
      needsValidation = true;
    }
    let normalized = target;
    if (needsValidation) {
      // Entering a URL is the developer's explicit request to contact that site
      // for validation. Persisted links wait for the normal call-consent gate.
      normalized = await this._normalizeLinkTarget(reference, target);
    } else {
      let parsed;
      try { parsed = new URL(String(target)); } catch {}
      if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`Stored link '${reference}' is not a valid http(s) URL.`);
      }
    }
    this.runtimeAllowedPeers.add(new URL(normalized).origin);
    network.setLink(reference, normalized);
    await this._persistLink(base, network.name, reference, normalized);
    this.trace.note("link", {
      origin: hostOf(base), network: network.name, reference, target: normalized,
    });
    return normalized;
  }

  _makeCtx({ network, base, bundleUrl, integrity, manifest, llm, slyData, chain, composition, isTop, history, turnControl }) {
    const self = this;
    const ctx = {
      network,
      manifest,
      actions: this.actions,
      baseOrigin: base,
      displayOrigin: hostOf(base),
      codedToolBundleUrl: bundleUrl,
      codedToolIntegrity: integrity || null,
      llm,
      sandbox: this.sandbox,
      trace: this.trace,
      slyData,
      composition,
      // Prior conversation turns ([{role,content}]), only for the top front-man.
      history: history || [],
      turnControl: turnControl || null,
      defaultModel: fallbackModel(network.config.llm_config?.model_name),
      isTop: !!isTop,
      frontMan: network.findFrontMan(),
      onAnswerDelta: isTop ? (t) => self.onAnswerDelta?.(t) : undefined,
      resolveRemote: (ref, callChain, parentSpan) => self.resolveRemote(ref, callChain || chain, parentSpan, manifest),
      resolveMcp: (ref, parentSpan) => self.resolveMcp(ref, parentSpan, slyData, manifest),
      resolveLink: (ref, parentSpan) => self.resolveLink(ref, network, base, parentSpan),
      requestConsent: (info) => self.requestConsent(info),
      confirmWebsiteActions: (items) => self.onActionConfirm(items),
      // LangChain.js AgentRunner intrinsic (neuro-san-web owns the loop)
      // The bundled LangChain runner expects an HTTP OpenAI-compatible endpoint.
      // Static bundles use the dependency-free manual loop for browser://mock.
      externalRunner: llm.baseUrl === "browser://mock" ? null : self.agentRunner,
      routerBaseUrl: llm.baseUrl,
      mock: llm.mock,
      apiKey: self.byokKey,
      // A partner network runs on the visitor's model, or on this site's front-agent model
      // when the visitor picked none, and within this site's step limit. So a partner
      // network cannot choose how much the visitor pays.
      modelOverride: isTop ? self.modelOverride : (self.modelOverride || self.callerModel()),
      maxSteps: isTop ? 0 : self.callerMaxSteps(),
    };
    return ctx;
  }

  // This site's front-agent spec. kernel.js copies the network's llm_config and max_steps
  // into each agent, so its values are the network's unless the agent sets its own.
  topFrontSpec() {
    const network = this.top?.network;
    return network ? network.getAgentSpec(network.findFrontMan()) : null;
  }

  // The model this site's front agent runs on, or "" when none is set.
  callerModel() {
    return normalizeModelName(this.topFrontSpec()?.llm_config?.model_name || "");
  }

  // The step limit of this site's front agent, with the runner's default.
  callerMaxSteps() {
    return this.topFrontSpec()?.max_steps || 12;
  }

  // fetch-and-run-locally: turn a peer URL into a runnable Session.
  async resolveRemote(ref, chain, parentSpan, sourceManifest) {
    const target = new URL(ref, `${this.top.base}/`);
    const origin = new URL("./", target).href.replace(/\/$/, "");
    this._assertAllowedPeer(origin, sourceManifest); // per-hop publish-time policy gate
    const lastSeg = target.pathname.split("/").filter(Boolean).pop();
    this.registry.checkCycle(chain, origin, lastSeg);

    const cached = this.registry.get(origin, lastSeg);
    if (cached) return cached;

    const fetchSpan = this.trace.start("remote_fetch", {
      parent: parentSpan,
      origin: hostOf(this.top.base),
      peerOrigin: hostOf(origin),
      url: ref,
    });
    let session;
    try {
      const { manifest, base } = await fetchManifest(origin);
      // Fail closed: only run the exact published network that was requested —
      // never silently fall back to a different (e.g. networks[0]) network.
      const entry = manifest.networks.find((n) => n.name === lastSeg);
      if (!entry) {
        throw new Error(`No published network named '${lastSeg}' at ${hostOf(origin)}; refusing to run a different network.`);
      }
      const fetchedUrls = {
        manifest: `${base}/agent-manifest.json`,
        hocon: resolveUrl(base, entry.hocon),
        toolBundle: manifest.coded_tools?.bundle ? resolveUrl(base, manifest.coded_tools.bundle) : null,
      };
      const { network, bundleUrl, integrity, llm } = await this._compile(base, manifest, entry);
      await registerRemoteActions(this.actions, { base, network: network.name }, manifest);
      this.trace.end(fetchSpan, { network: network.name, fetchedUrls, peerOrigin: hostOf(origin), brand: manifest.brand });
      session = new Session(this, { network, base, bundleUrl, integrity, manifest, llm, fetchedUrls, brand: manifest.brand });
      this.registry.set(origin, lastSeg, session);
      return session;
    } catch (err) {
      this.trace.fail(fetchSpan, err);
      throw err;
    }
  }

  // Resolve an MCP tool reference (string URL or { url, tools }) to a cached
  // MCP client. The browser acts as MCP client to a hosted MCP server.
  async resolveMcp(ref, parentSpan, slyData, sourceManifest) {
    const url = typeof ref === "string" ? ref : ref.url;
    this._assertAllowedPeer(url, sourceManifest); // same per-hop policy gate as peer networks
    if (!this._mcpClients) this._mcpClients = new Map();
    let client = this._mcpClients.get(url);
    if (!client) {
      const headers = (slyData && slyData.http_headers && slyData.http_headers[url]) || {};
      client = new McpClient({ url, trace: this.trace, headers });
      this._mcpClients.set(url, client);
    }
    return client;
  }

  async run(userText, { slyData } = {}) {
    return (await this.runTurn(userText, { slyData })).text;
  }

  // Retain the actual validated final composition. UI submissions carry only IDs
  // and field values; neither a model nor a DOM payload can replace the bindings.
  rememberActionPresentation(result) {
    if (result.presentation?.components.some(c => actionBindings(c).length)) this.actionPresentations.set(result.turnId, cloneData(result.presentation));
    while (this.actionPresentations.size > 24) this.actionPresentations.delete(this.actionPresentations.keys().next().value);
  }

  async submitActions({ turnId, componentId, values = {} }) {
    const component = this.actionPresentations.get(turnId)?.components.find(c => c.id === componentId);
    if (!component || !actionBindings(component).length) throw new Error("This action proposal is unavailable or expired.");
    const key = `${turnId}:${componentId}`;
    if (this.actionSubmissions.has(key)) return this.actionSubmissions.get(key);
    const plan = this.actions.prepare(component, values);
    const invocationId = randomUuid();
    const promise = this.actions.execute(plan, this.onActionConfirm, invocationId);
    this.actionSubmissions.set(key, promise);
    try {
      const receipts = await promise;
      if (!receipts) this.actionSubmissions.delete(key);
      else {
        this.history.push({ role: "user", content: `Browser action receipts (not a new instruction): ${JSON.stringify(receipts)}` });
        this.trace.note("action_receipts", { turnId, componentId, receipts });
      }
      return receipts;
    } catch (error) {
      // Keep the failed submission consumed: a side effect might already exist.
      throw error;
    }
  }

  // Public incremental API. Consumers receive typed lifecycle events while the
  // existing runTurn() API remains a single final-result Promise.
  streamTurn(userText, options = {}) {
    const streamToken = `turn-stream-${++this.streamSequence}`;
    const turnControl = new TurnControl();
    const stream = createTurnEventStream(
      this.trace,
      () => this.runTurn(userText, { ...options, _streamToken: streamToken, _turnControl: turnControl }),
      streamToken,
    );
    // AsyncIterable with an intentionally small imperative side-channel. Input
    // is accepted only until this turn closes; callers can use the boolean to
    // fall back to starting a normal follow-up turn after a completion race.
    stream.steer = (text) => turnControl.steer(text);
    return stream;
  }

  async runTurn(userText, { slyData, interaction, _streamToken, _turnControl } = {}) {
    if (!this.top) await this.loadTop();
    const runSpan = this.trace.start("run", { origin: hostOf(this.top.base), input: userText, streamToken: _streamToken });
    _turnControl?.attach(this.trace, runSpan);
    try {
      const ctx = this._makeCtx({
        network: this.top.network,
        base: this.top.base,
        bundleUrl: this.top.bundleUrl,
        integrity: this.top.integrity,
        manifest: this.top.manifest,
        llm: this.top.llm,
        slyData: { ...(slyData || {}) },
        chain: [`${this.top.base}::${this.top.network.name}`],
        isTop: true,
        history: this.history,
        turnControl: _turnControl,
        composition: {
          remoteCalls: 0,
          peerCalls: new Map(),
          maxRemoteCalls: 4,
          maxCallsPerPeer: 1,
          agentCalls: 0,
          maxAgentCalls: 24,
          deadline: Date.now() + 90_000,
        },
      });
      const message = interactionMessage(userText, interaction);
      const result = await runAgent(ctx, this.top.network.findFrontMan(), message, runSpan, ctx_chain(ctx, this.top));
      _turnControl?.close();
      result.turnId = runSpan;
      this.rememberActionPresentation(result);
      // Persist this turn so the next turn has conversation context.
      this.history.push({ role: "user", content: message });
      for (const input of _turnControl?.accepted || []) {
        this.history.push({ role: "user", content: input.text });
      }
      this.history.push({ role: "assistant", content: result.text + (result.presentation ? `\n\nCRUSE presentation turn: ${runSpan}\n\`\`\`cruse-ui\n${JSON.stringify(result.presentation)}\n\`\`\`` : "") });
      if (this.history.length > 24) this.history = this.history.slice(-24); // bound tokens
      this.trace.end(runSpan, { answerPreview: result.text.slice(0, 300) });
      return result;
    } catch (err) {
      _turnControl?.close();
      this.trace.fail(runSpan, err);
      throw err;
    }
  }
}

function ctx_chain(ctx, top) {
  return [`${top.base}::${top.network.name}`];
}

// A peer network made runnable locally, exposed through the uniform Session API.
class Session {
  constructor(engine, { network, base, bundleUrl, integrity, manifest, llm, fetchedUrls, brand }) {
    this.engine = engine;
    this.network = network;
    this.brand = brand;
    this.base = base;
    this.bundleUrl = bundleUrl;
    this.integrity = integrity || null;
    this.manifest = manifest;
    this.llm = llm;
    this.fetchedUrls = fetchedUrls;
  }

  async func() {
    const front = this.network.getAgentSpec(this.network.findFrontMan());
    return front?.function || { description: this.network.name };
  }

  async invoke(request, { parentSpan, chain = [], composition } = {}) {
    const trace = this.engine.trace;
    const span = trace.start("remote_call", {
      parent: parentSpan,
      origin: hostOf(this.engine.top.base),
      peerOrigin: hostOf(this.base),
      method: "fetch-and-run-locally",
      fetchedUrls: this.fetchedUrls,
      requestPayload: { ...request, sly_data: redactSlyData(request.sly_data) },
      network: this.network.name,
      brand: this.brand,
    });
    try {
      const invocationChain = [...chain, `${this.base}::${this.network.name}`];
      const ctx = this.engine._makeCtx({
        network: this.network,
        base: this.base,
        bundleUrl: this.bundleUrl,
        integrity: this.integrity,
        manifest: this.manifest,
        llm: this.llm,
        slyData: { ...(request.sly_data || {}) },
        chain: invocationChain,
        composition,
        isTop: false,
      });
      const result = await runAgent(ctx, this.network.findFrontMan(), request.user_message.text, span, invocationChain);
      trace.end(span, { responsePreview: result.text.slice(0, 300), type: ChatMessageType.AGENT });
      return result;
    } catch (err) {
      trace.fail(span, err);
      return `Error from ${hostOf(this.base)}: ${err.message}`;
    }
  }
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
