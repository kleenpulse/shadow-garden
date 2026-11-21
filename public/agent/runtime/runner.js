// runner.js — the AgentRunner intrinsic.
// Changed by agentic-web. See README.md in this folder for what changed.
//
// Two interchangeable implementations of one agent's LLM tool-calling loop:
//   * runAgentManual   — a dependency-free reference loop (default).
//   * langGraphRunner   — LangChain.js + LangGraph.js createReactAgent, loaded as a
//                         pre-bundled browser artifact (runtime/generated/agent-runner.bundle.js).
// Both share buildToolTable() + dispatchToolCall() so a neuro-san tool (peer agent,
// sandboxed coded tool, REST/toolbox tool, remote fetched-and-run network) executes
// identically regardless of which loop drives it. The engine selects via ctx.useLangGraph.

import { ChatMessageType, filterSlyData, allowedDownstreamSly, parseExternalAgent } from "./kernel.js";
import { actionContext, proposalRefs } from "./actions.js";
import { parseAgentResponse, agentPresentationContext, normalizePresentation, consolidateIntakePresentations } from "./cruse.js";
import { applyPendingSteering, runInterruptibleModelCall } from "./turn-control.js";
import { assertModelForRouter, effectiveModel } from "./model.js";

let invocationSequence = 0;

export function argsToText(args) {
  if (args == null) return "";
  if (typeof args === "string") return args;
  if (args.request) return String(args.request);
  if (args.input) return String(args.input);
  if (args.input_string) return String(args.input_string);
  return JSON.stringify(args);
}

export function safeName(s) {
  return s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "").slice(0, 60) || "tool";
}

function hostOfUrl(url) {
  try { return new URL(url).host; } catch { return url; }
}

// Consent protects a site boundary, not every service call. Local MCP hosts are
// deliberately exposed through same-origin /_mcp routes and are part of the page
// the visitor already chose to use. /ext-mcp is the exception: it is a
// same-origin transport proxy whose destination is an external MCP server.
export function requiresThirdPartyApproval(ref, baseOrigin) {
  const raw = typeof ref === "string" ? ref : ref?.url;
  try {
    const base = new URL(baseOrigin);
    const target = new URL(raw, base);
    const externalMcpProxy = /^\/ext-mcp(?:\/|$)/i.test(target.pathname);
    return externalMcpProxy || target.origin !== base.origin;
  } catch {
    // Invalid or opaque destinations must never bypass the consent boundary.
    return true;
  }
}

export function remoteIsInChain(ref, baseOrigin, chain = []) {
  try {
    const parsed = parseExternalAgent(ref, baseOrigin);
    return chain.includes(`${parsed.origin}::${parsed.agentName}`);
  } catch {
    return false;
  }
}

export function consumeRemoteBudget(composition, targetKey, now = Date.now()) {
  if (!composition) return null;
  if (now >= composition.deadline) return "the composition deadline was reached";
  if (composition.remoteCalls >= composition.maxRemoteCalls) {
    return `the per-query limit of ${composition.maxRemoteCalls} third-party calls was reached`;
  }
  const prior = composition.peerCalls.get(targetKey) || 0;
  if (prior >= composition.maxCallsPerPeer) return "that network was already consulted for this query";
  composition.remoteCalls += 1;
  composition.peerCalls.set(targetKey, prior + 1);
  return null;
}

export function consumeAgentBudget(composition, now = Date.now()) {
  if (!composition) return null;
  if (now >= composition.deadline) return "the 90-second query deadline was reached";
  if (composition.agentCalls >= composition.maxAgentCalls) {
    return `the per-query limit of ${composition.maxAgentCalls} agent invocations was reached`;
  }
  composition.agentCalls += 1;
  return null;
}

// Rough per-1M-token prices [input, output] for cost estimates. Approximate.
const PRICE = {
  "gpt-4o": [2.5, 10], "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1": [2, 8], "gpt-4.1-mini": [0.4, 1.6], "gpt-4.1-nano": [0.1, 0.4],
  "o4-mini": [1.1, 4.4], "gpt-5.2": [1.25, 10],
};

// Estimate the token cost of running a peer network for one request. Heuristic:
// prompt grows with each agent's instructions + tool schemas (re-sent per round),
// and there is roughly one model round-trip per tool plus a final summary.
export function estimateRemoteCost({ network, requestText, model, mock }) {
  let instrChars = 0;
  for (const a of network.config.tools || []) {
    instrChars += (a.instructions || "").length + JSON.stringify(a.function || {}).length;
  }
  const fm = network.getAgentSpec(network.findFrontMan());
  const toolCount = (fm?.tools || []).length;
  const rounds = 1 + toolCount;
  const promptTokens = Math.round(((instrChars + (requestText || "").length) / 4) * (1 + 0.3 * toolCount));
  const completionTokens = rounds * 120;
  const totalTokens = promptTokens + completionTokens;
  let costText = null;
  if (mock) costText = "$0.00 (mock)";
  else {
    const key = (model || "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
    const p = PRICE[model] || PRICE[key];
    if (p) {
      const c = (promptTokens / 1e6) * p[0] + (completionTokens / 1e6) * p[1];
      costText = "$" + c.toFixed(c < 0.01 ? 4 : 3);
    }
  }
  return { totalTokens, promptTokens, completionTokens, costText };
}

export function schemaFor(name, fn) {
  return {
    type: "function",
    function: {
      name,
      description: (fn && fn.description) || name,
      parameters: (fn && fn.parameters) || {
        type: "object",
        properties: { request: { type: "string", description: "The request to handle." } },
        required: ["request"],
      },
    },
  };
}

// Why a registered site action cannot be a website_* tool for this network, or "" when it
// can. The site decides first: its manifest's actions.agentTools lists the actions its
// agents may call.
// - The visitor's own site gets its local-only actions. An irreversible one also needs
//   the page's confirmation dialog.
// - A partner network runs on this page, so it never gets this page's actions. It gets
//   only the actions its own bridge shares with this page's origin, run with the
//   partner's own code on the partner's origin. A read runs in a hidden frame. A write
//   runs in the partner's own window, where the visitor confirms it.
export function websiteToolRefusal(ctx, action) {
  if (!action) return "no such action is registered for this network";
  if (!(ctx.manifest?.actions?.agentTools || []).includes(action.name)) return "not listed in the manifest's actions.agentTools";
  if (!ctx.isTop) {
    if (action.availability !== "bridge") return "a partner network gets only actions its bridge shares";
    return "";
  }
  if (action.availability !== "local-only") return "not a local-only action";
  if (action.effect === "irreversible" && typeof ctx.confirmWebsiteActions !== "function") {
    return "irreversible, and the page has no confirmation dialog";
  }
  return "";
}

// Build the tool table + OpenAI-style schemas for one agent's `tools`.
export async function buildToolTable(ctx, spec, chain, parentSpan) {
  const { network } = ctx;
  const toolByName = new Map();
  const toolSchemas = [];
  for (const ref of spec.tools || []) {
    const c = network.classifyTool(ref);
    if (c.kind === "missing") continue;

    if (c.kind === "mcp") {
      // Discovering third-party MCP tools requires a tools/list call. Gate that
      // cross-site contact before anything is sent. Same-site services are already
      // within the page's trust boundary and must not produce an approval prompt.
      const host = hostOfUrl(typeof ref === "string" ? ref : ref.url);
      const requiresApproval = requiresThirdPartyApproval(ref, ctx.baseOrigin);
      if (requiresApproval) {
        const decision = await ctx.requestConsent?.({
          kind: "mcp", phase: "discover", peerLabel: "Destination service", peerOrigin: host,
          requestText: "(discover available tools)",
          est: { totalTokens: 0, costText: ctx.mock ? "$0.00 (mock)" : "metadata only" },
        });
        if (decision === "decline") {
          ctx.trace.note("consent", { parent: parentSpan, origin: ctx.displayOrigin, peerOrigin: host, phase: "discover", decision: "declined" });
          continue;
        }
      }
      const client = await ctx.resolveMcp(ref, parentSpan);
      for (const t of await client.listTools(parentSpan)) {
        const name = safeName(`mcp_${t.name}`);
        toolByName.set(name, { kind: "mcp", ref, client, mcpName: t.name, requiresApproval });
        toolSchemas.push(schemaFor(name, { description: t.description, parameters: t.inputSchema }));
      }
    } else if (c.kind === "remote") {
      if (remoteIsInChain(ref, ctx.baseOrigin, chain)) {
        ctx.trace.note("composition_skip", {
          parent: parentSpan, origin: ctx.displayOrigin, target: ref,
          reason: "already visited in this request",
        });
        continue;
      }
      // Do NOT contact the peer here. Advertise a generic schema and defer the
      // fetch-and-run (manifest + HOCON + tool bundle) until the user consents at
      // call time — so consent truly precedes any contact with the partner origin.
      const name = safeName(parseExternalAgent(ref, ctx.baseOrigin).agentName);
      const host = hostOfUrl(ref);
      const label = ctx.network.linkLabels?.[ref] || name;
      toolByName.set(name, { kind: "remote", url: ref, label });
      toolSchemas.push(schemaFor(name, { description: `Hand off to the ${label} network. Provide a natural-language request.` }));
    } else if (c.kind === "link") {
      // A dangling HOCON reference remains callable. Resolution is deferred until
      // the model actually selects it, at which point the UI asks for a peer URL.
      const name = safeName(ref);
      toolByName.set(name, { kind: "link", reference: ref });
      toolSchemas.push(schemaFor(name, {
        description: `Hand off to the linked agent network "${ref}". If it is not linked yet, ask the developer for its nsDeploy site URL.`,
      }));
    } else {
      const name = safeName(c.ref);
      toolByName.set(name, c);
      toolSchemas.push(schemaFor(name, c.spec.function));
    }
  }
  // Publisher opt-in: expose selected website actions as model tools. websiteToolRefusal
  // says which ones this network may call.
  for (const action of ctx.actions?.catalog({ base: ctx.baseOrigin, network: network.name }) || []) {
    if (websiteToolRefusal(ctx, action)) continue;
    const name = `website_${action.name}`;
    if (toolByName.has(name)) throw new Error(`Duplicate website tool: ${name}`);
    toolByName.set(name, { kind: "website", ref: action.ref, parallelSafe: false });
    toolSchemas.push(schemaFor(name, { description: action.description, parameters: action.inputSchema }));
  }
  if (network.config?.cruse) {
    toolByName.set("render_cruse", { kind: "presentation", parallelSafe: false });
    toolSchemas.push(schemaFor("render_cruse", {
      description: "Create the CRUSE widgets for this response. Use this to show a consolidated form when several answers are needed, or a table, choice, report or other supported component. Widgets are preserved even if your final answer is plain text. This collects input or presents information; it does not execute website operations.",
      parameters: {
        type: "object", required: ["presentation"], additionalProperties: false,
        properties: {
          presentation: {
            type: "object", required: ["version", "components"], additionalProperties: false,
            properties: {
              version: { type: "integer", enum: [1] },
              components: { type: "array", minItems: 1, items: { type: "object" } },
            },
          },
        },
      },
    }));
  }
  return { toolByName, toolSchemas };
}

// Merge a coded tool's returned sly_data back into the context with output
// filtering. If the tool's function declares `sly_data_output_schema`, only those
// keys may be written. Otherwise the tool may ADD new keys but must not OVERWRITE
// existing ones — so untrusted code can't clobber sensitive entries (e.g. tokens).
function mergeToolSlyData(ctx, spec, slyData) {
  if (!slyData || typeof slyData !== "object") return;
  const declared = spec.function?.sly_data_output_schema?.properties;
  const allowWrite = declared ? new Set(Object.keys(declared)) : null;
  for (const [k, v] of Object.entries(slyData)) {
    if (allowWrite) {
      if (allowWrite.has(k)) ctx.slyData[k] = v;
    } else if (!(k in ctx.slyData)) {
      ctx.slyData[k] = v;
    }
  }
}

function entryAllowsParallel(entry) {
  if (!entry) return true;
  if (entry.parallelSafe === false || entry.spec?.parallel_safe === false || entry.spec?.execution?.parallel_safe === false) return false;
  if (entry.kind === "toolbox") {
    return String(entry.spec?.args?.method || "GET").toUpperCase() === "GET";
  }
  return true;
}

function toolKind(entry) {
  if (!entry) return "unknown";
  return {
    agent: "agent",
    coded: "coded (sandbox)",
    toolbox: "REST (backend)",
    mcp: "MCP",
    link: "linked network",
    remote: "remote network",
  }[entry.kind] || entry.kind;
}

function changed(a, b) {
  if (Object.is(a, b)) return false;
  try { return JSON.stringify(a) !== JSON.stringify(b); } catch { return true; }
}

// Execute sibling tool calls concurrently while preserving their model-visible
// result order. Each sibling receives a private sly_data snapshot; writes are
// merged back in call order so a faster tool cannot create nondeterministic state.
// A tool can opt out with parallel_safe=false. Non-GET REST calls are serialized.
export async function executeToolCalls(ctx, calls, parentSpan, chain, { maxConcurrency = 4 } = {}) {
  if (!calls.length) return [];
  if (!ctx.slyData) ctx.slyData = {};
  const initialSly = { ...(ctx.slyData || {}) };
  const concurrency = calls.every((call) => entryAllowsParallel(call.entry))
    ? Math.max(1, Math.min(maxConcurrency, calls.length))
    : 1;
  const results = new Array(calls.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= calls.length) return;
      const call = calls[index];
      const callCtx = { ...ctx, slyData: { ...initialSly } };
      const span = ctx.trace.start("tool", {
        parent: parentSpan,
        origin: ctx.displayOrigin,
        tool: call.name,
        callId: call.id,
        toolKind: toolKind(call.entry),
        args: call.args,
      });
      try {
        const raw = call.entry
          ? await dispatchToolCall(callCtx, call.entry, call.args, span, chain)
          : `Error: unknown tool '${call.name}'`;
        const encoded = typeof raw === "string" ? raw : JSON.stringify(raw);
        const content = encoded ?? String(raw ?? "");
        ctx.trace.end(span, { resultPreview: content.slice(0, 240) });
        results[index] = { ...call, content, slyData: callCtx.slyData };
      } catch (error) {
        const message = String(error?.message || error);
        const content = `Error from tool '${call.name}': ${message}`;
        ctx.trace.end(span, { status: "error", error: message, resultPreview: content.slice(0, 240) });
        results[index] = { ...call, content, error, slyData: callCtx.slyData };
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  for (const result of results) {
    for (const [key, value] of Object.entries(result.slyData || {})) {
      if (changed(initialSly[key], value)) ctx.slyData[key] = value;
    }
  }
  return results;
}

export async function dispatchToolCall(ctx, entry, args, parentSpan, chain) {
  const { trace } = ctx;

  if (entry.kind === "presentation") {
    if (!ctx.presentationOutput) throw new Error("No presentation output is available for this invocation.");
    const normalized = normalizePresentation(args.presentation, ctx.invocation);
    if (!normalized.presentation || normalized.issues.length) {
      throw new Error(normalized.issues.join(" ") || "Provide at least one valid CRUSE component.");
    }
    const result = { presentation: normalized.presentation };
    ctx.actions?.validatePresentation(result, ctx.allowedActionRefs || new Set());
    if (!result.presentation || result.presentationIssues?.length) {
      throw new Error(result.presentationIssues?.join(" ") || "Invalid CRUSE action binding.");
    }
    ctx.presentationOutput.presentation = result.presentation;
    return { status: "accepted", componentIds: result.presentation.components.map(c => c.id),
      message: "Widgets are attached to your response. Finish with a brief introduction; do not repeat the form questions in prose. This has not placed an order." };
  }

  if (entry.kind === "website") {
    const registered = ctx.actions.entries.get(entry.ref);
    // The same check that offered the tool, run again when the model calls it.
    if (!registered || registered.base !== ctx.baseOrigin || registered.network !== ctx.network.name
      || websiteToolRefusal(ctx, registered)) {
      throw new Error("Website action is not callable by this agent.");
    }
    const plan = ctx.actions.prepare({ kind: "action", action: entry.ref, arguments: args });
    // A partner's write is confirmed in the partner's own window, not on this page.
    const confirm = registered.effect === "irreversible" && ctx.isTop
      ? ctx.confirmWebsiteActions : async () => true;
    const receipts = await ctx.actions.execute(plan, confirm, crypto.randomUUID());
    return receipts?.[0] || { action: entry.ref, status: "cancelled", message: "Customer declined; nothing was submitted." };
  }

  if (entry.kind === "agent") {
    const result = await runAgent(ctx, entry.ref, argsToText(args), parentSpan, chain);
    if (result.presentation) ctx.presentationOutput?.children?.push(result.presentation);
    return result;
  }

  if (entry.kind === "coded") {
    // Secure default: a coded tool receives NO sly_data unless its spec explicitly
    // grants keys via an allow block. (The old default handed the tool everything —
    // including secrets like backend_token.) Untrusted peer code never sees more
    // than it is declared to need.
    const permitted = filterSlyData(ctx.slyData, allowedDownstreamSly(entry.spec) || []);
    const { result, slyData } = await ctx.sandbox.invoke({
      bundleUrl: ctx.codedToolBundleUrl,
      integrity: ctx.codedToolIntegrity,
      className: entry.spec.class,
      args,
      permittedSly: permitted,
      origin: ctx.displayOrigin,
      parentSpan,
    });
    mergeToolSlyData(ctx, entry.spec, slyData);
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  if (entry.kind === "toolbox") {
    return dispatchRest(ctx, entry, args, parentSpan);
  }

  if (entry.kind === "mcp") {
    if (entry.requiresApproval ?? requiresThirdPartyApproval(entry.ref || entry.client.url, ctx.baseOrigin)) {
      // Discovery was approved separately. Confirm the actual third-party call
      // with the payload the user is about to send. Same-site MCP calls skip both
      // prompts because they do not cross the site's trust boundary.
      const host = hostOfUrl(entry.client.url);
      const requestText = argsToText(args);
      const decision = await ctx.requestConsent?.({
        kind: "mcp", phase: "call", peerLabel: "Destination service", peerOrigin: host,
        requestText,
        est: { totalTokens: Math.round((requestText.length + 80) / 4), costText: ctx.mock ? "$0.00 (mock)" : null },
      });
      if (decision === "decline") {
        ctx.trace.note("consent", { parent: parentSpan, origin: ctx.displayOrigin, peerOrigin: host, phase: "call", decision: "declined" });
        return `The user declined to send this request to ${host}. Continue without it.`;
      }
    }
    return entry.client.callTool(entry.mcpName, args, parentSpan);
  }

  if (entry.kind === "link") {
    const target = await ctx.resolveLink(entry.reference, parentSpan);
    if (!target) return `The user did not link '${entry.reference}'. Continue without it.`;
    return dispatchToolCall(ctx, { kind: "remote", url: target, label: entry.reference }, args, parentSpan, chain);
  }

  if (entry.kind === "remote") {
    const requestText = argsToText(args);
    const host = hostOfUrl(entry.url);
    if (requiresThirdPartyApproval(entry.url, ctx.baseOrigin)) {
      // The third-party peer has not been fetched yet, so consent genuinely
      // precedes contact. A network published by this same site stays local.
      const est = {
        totalTokens: Math.round((requestText.length + 300) / 4) * 2,
        costText: ctx.mock ? "$0.00 (mock)" : null,
      };
      const decision = await ctx.requestConsent?.({
        kind: "network", peerLabel: entry.label || host, peerOrigin: host, requestText, est,
      });
      if (decision === "decline") {
        ctx.trace.note("consent", { parent: parentSpan, origin: ctx.displayOrigin, peerOrigin: host, decision: "declined" });
        return `The user declined to contact ${host}. Proceed without it and note that to the user.`;
      }
    }
    const parsed = parseExternalAgent(entry.url, ctx.baseOrigin);
    const budgetReason = consumeRemoteBudget(ctx.composition, `${parsed.origin}::${parsed.agentName}`);
    if (budgetReason) {
      ctx.trace.note("composition_limit", {
        parent: parentSpan, origin: ctx.displayOrigin, target: entry.url,
        reason: budgetReason, remoteCalls: ctx.composition?.remoteCalls,
      });
      return `Skipped ${entry.label || host}: ${budgetReason}. Continue with available results and do not retry it.`;
    }
    // Approved — only now fetch-and-run the peer network.
    let session;
    try {
      session = await ctx.resolveRemote(entry.url, chain, parentSpan);
    } catch (err) {
      if (err?.code === "COMPOSITION_CYCLE" || err?.code === "COMPOSITION_DEPTH") {
        return `Skipped ${entry.label || host}: that network is already in this request's call chain. Continue with available results and do not retry it.`;
      }
      throw err;
    }
    const downstreamSly = filterSlyData(ctx.slyData, allowedDownstreamSly(ctx.network.getAgentSpec(ctx.frontMan)) || []);
    const request = {
      user_message: { type: ChatMessageType.HUMAN, text: requestText },
      sly_data: downstreamSly,
      chat_filter: { chat_filter_type: "MINIMAL" },
    };
    const result = await session.invoke(request, { parentSpan, chain, composition: ctx.composition });
    for (const ref of proposalRefs(result)) ctx.allowedActionRefs?.add(ref);
    return result;
  }

  return `Error: unsupported tool kind '${entry.kind}'`;
}

// The model one agent sends. effectiveModel keeps this in step with the settings panel.
function agentModel(ctx, spec) {
  return effectiveModel(ctx.modelOverride, spec?.llm_config?.model_name, ctx.network.config?.llm_config?.model_name);
}

// Dispatcher: the LangChain.js runner when enabled, else the dependency-free
// reference loop. Either way neuro-san-web owns multi-agent orchestration.
export async function runAgent(ctx, agentName, userText, parentSpan, chain) {
  const source = { origin: ctx.displayOrigin, network: ctx.network.name, agent: agentName, invocation: `cruse-${++invocationSequence}` };
  const budgetReason = consumeAgentBudget(ctx.composition);
  if (budgetReason) {
    ctx.trace.note("composition_limit", {
      parent: parentSpan, origin: ctx.displayOrigin, agent: agentName,
      reason: budgetReason, agentCalls: ctx.composition?.agentCalls,
    });
    return parseAgentResponse(`Skipped ${agentName}: ${budgetReason}. Continue with available results and do not retry it.`, source);
  }
  // Check here so both runners fail closed before tool discovery or a model call.
  // Without a key, skip it: both runners report the missing key first.
  if (ctx.apiKey && ctx.apiKey !== "demo") {
    assertModelForRouter(agentModel(ctx, ctx.network.getAgentSpec(agentName)), ctx.mock, hostOfUrl(ctx.routerBaseUrl));
  }
  // Scope prompt context to this invocation. Never mutate a shared agent spec or
  // ctx: siblings and remote networks can be running concurrently.
  const catalog = ctx.actions?.catalog({ base: ctx.baseOrigin, network: ctx.network.name }) || [];
  const presentationContext = agentPresentationContext(ctx, agentName);
  // An action that is not a tool here is offered as a proposal instead.
  const proposalCatalog = catalog.filter(action => websiteToolRefusal(ctx, action));
  // A partner network that shares no actions gets no note: "report a missing
  // integration" would be wrong, since another site called it on purpose.
  const websiteContext = proposalCatalog.length || (!catalog.length && ctx.isTop)
    ? actionContext(proposalCatalog)
    : !catalog.length ? ""
    : "\nWebsite operations are connected as website_* tools. CRUSE forms remain available to collect missing details in one step. Return an ordinary form without submit.actions; its submitted values arrive as CRUSE interaction data on the next turn. Then call the appropriate website tool using those values. A form submission only supplies answers; checkout still requires the tool's browser confirmation. Do not report a missing integration.\n";
  const context = presentationContext + (presentationContext && ctx.actions ? websiteContext : "");
  const network = Object.create(ctx.network);
  network.getAgentSpec = (name) => {
    const spec = ctx.network.getAgentSpec(name);
    return name === agentName && spec && context ? { ...spec, instructions: `${spec.instructions || ""}\n\n${context}` } : spec;
  };
  const local = { ...ctx, network, invocation: source.invocation,
    presentationOutput: { presentation: null, children: [] }, allowedActionRefs: new Set(catalog.map(a => a.ref)) };
  const raw = ctx.externalRunner
    ? await ctx.externalRunner(local, agentName, userText, parentSpan, chain, {
      buildToolTable, dispatchToolCall, executeToolCalls, schemaFor, argsToText,
      applyPendingSteering, runInterruptibleModelCall,
    })
    : await runAgentManual(local, agentName, userText, parentSpan, chain);
  const result = parseAgentResponse(raw, source);
  if (!result.presentation) {
    result.presentation = local.presentationOutput.presentation
      || consolidateIntakePresentations(local.presentationOutput.children);
  }
  ctx.actions?.validatePresentation(result, local.allowedActionRefs);
  for (const ref of proposalRefs(result)) ctx.allowedActionRefs?.add(ref);
  ctx.trace.note("presentation_proposal", { parent: parentSpan, ...source, presentation: result.presentation, issues: result.presentationIssues });
  ctx.trace.note("agent_result", { parent: parentSpan, ...source, text: result.text, presentation: result.presentation });
  return result;
}

export async function runAgentManual(ctx, agentName, userText, parentSpan, chain) {
  const { network, llm, trace } = ctx;
  const spec = network.getAgentSpec(agentName);
  if (!spec) throw new Error(`agent '${agentName}' not found`);

  const origin = ctx.displayOrigin;
  const isTopFrontMan = ctx.isTop && agentName === ctx.frontMan;
  const agentSpan = trace.start("agent", {
    parent: parentSpan, origin, agent: agentName, network: network.name,
    displayAs: spec.class ? "coded_tool" : "llm_agent", runner: "manual",
    invocation: ctx.invocation, isTopFrontMan,
  });

  try {
    const { toolByName, toolSchemas } = await buildToolTable(ctx, spec, chain, agentSpan);

    const sysParts = [];
    if (spec.instructions) sysParts.push(spec.instructions.trim());
    if (spec.command) sysParts.push(spec.command.trim());
    const messages = [{ role: "system", content: sysParts.join("\n\n") || "You are a helpful agent." }];
    if (isTopFrontMan && ctx.history?.length) messages.push(...ctx.history);
    messages.push({ role: "user", content: userText });

    const model = agentModel(ctx, spec);
    // A partner context carries this site's step limit (engine.js _makeCtx), so a partner
    // network cannot raise it.
    const maxSteps = Math.min(spec.max_steps || network.config.max_steps || 12, ctx.maxSteps || Infinity);

    let finalText = "";
    for (let step = 0; step < maxSteps; step++) {
      if (isTopFrontMan) {
        applyPendingSteering(ctx.turnControl, (text) => messages.push({ role: "user", content: text }));
      }
      const onContentDelta = isTopFrontMan ? (t) => ctx.onAnswerDelta?.(t) : undefined;
      const attempt = await runInterruptibleModelCall(isTopFrontMan ? ctx.turnControl : null, (signal) =>
        llm.chat({ model, messages, tools: toolSchemas, origin, parentSpan: agentSpan, onContentDelta, signal }));
      if (attempt.interrupted) {
        step -= 1; // steering retries the same model step; it is not an agent step
        continue;
      }
      const res = attempt.value;
      if (isTopFrontMan && ctx.turnControl?.pending.length) {
        step -= 1;
        continue;
      }
      if (res.toolCalls.length === 0) {
        finalText = res.content;
        break;
      }
      messages.push({ role: "assistant", content: res.content || null, tool_calls: res.toolCalls });
      const calls = res.toolCalls.map((tc) => {
        let args = {};
        try { args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; }
        catch { args = { request: tc.function.arguments }; }
        return { id: tc.id, name: tc.function.name, args, entry: toolByName.get(tc.function.name) };
      });
      const toolResults = await executeToolCalls(ctx, calls, agentSpan, chain);
      for (const result of toolResults) {
        messages.push({ role: "tool", tool_call_id: result.id, name: result.name, content: result.content });
        trace.note("tool_result", { parent: agentSpan, origin, tool: result.name, preview: result.content.slice(0, 200), type: ChatMessageType.AGENT_TOOL_RESULT });
      }
    }

    trace.end(agentSpan, { answerChars: finalText.length });
    return finalText;
  } catch (err) {
    trace.fail(agentSpan, err);
    throw err;
  }
}

// Built-in REST toolbox (requests_get / http_get): fetch a URL, attaching a bearer
// token from sly_data if present — an authenticated call to a business backend.
async function dispatchRest(ctx, entry, args, parentSpan) {
  const { trace } = ctx;
  // The configured backend URL is authoritative. A (prompt-injected) model must
  // NOT be able to supply args.url to redirect this authenticated request to an
  // arbitrary origin and exfiltrate the bearer token. A dynamic URL would require
  // an explicit, validated allow-list on the tool spec — none exists here, so the
  // model-supplied url is ignored entirely.
  const url = entry.spec.args?.url;
  if (!url) return `Error: REST tool '${entry.ref}' has no configured URL.`;
  const method = (entry.spec.args?.method || "GET").toUpperCase();
  const headers = {};
  const token = ctx.slyData?.backend_token;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const span = trace.start("rest_call", {
    parent: parentSpan, origin: ctx.displayOrigin, tool: entry.ref, toolKind: "REST (backend)",
    method, url, headers: token ? { Authorization: "Bearer <redacted>" } : {},
  });
  try {
    const resp = await fetch(url, { method, headers });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`REST ${resp.status}`);
    trace.end(span, { status: "ok", httpStatus: resp.status, preview: text.slice(0, 200) });
    return text;
  } catch (err) {
    trace.fail(span, err);
    return `Error calling ${url}: ${err.message}`;
  }
}
