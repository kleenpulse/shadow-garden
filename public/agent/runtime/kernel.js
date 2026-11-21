// kernel.js — the pure, framework-free orchestration logic.
//
// This module is the browser-side reference for what the plan calls the
// "cross-compilable kernel": config filter chain, AgentNetwork, the activation
// taxonomy (wiring only — NOT the agentic loop), validators, sly_data redaction,
// the ChatMessage envelope, and external/MCP URL parsing. It imports nothing
// browser-specific and nothing framework-specific, so it is exactly the surface
// `nsxc` would generate from neuro_san/kernel/. It is hand-written here so the demo
// runs today; behavioral parity tests (see nsxc/) pin it to the Python source.

import { deepMerge, isPlainObject } from "./hocon.js";
import { normalizeModelName } from "./model.js";
// Cross-compiled from neuro_san/kernel by nsxc (regenerated every build, drift-gated).
import { find_front_man, classify_tool } from "./generated/graph.gen.mjs";
import { validate_network } from "./generated/validation.gen.mjs";

// --- ChatMessage envelope (mirrors neuro_san/api/grpc/chat.proto) ------------

export const ChatMessageType = {
  UNKNOWN: 0,
  SYSTEM: 1,
  HUMAN: 2,
  AI: 4,
  AGENT: 100,
  AGENT_FRAMEWORK: 101,
  AGENT_TOOL_RESULT: 103,
  AGENT_PROGRESS: 104,
};

export function chatMessage(type, text, origin = [], extra = {}) {
  return { type, text, origin, ...extra };
}

// --- sly_data redaction (mirrors AgentFrameworkMessage.translate_for_trace) --

// Keep keys, drop values, when sly_data crosses an origin/trust boundary.
export function redactSlyData(slyData) {
  if (!slyData) return slyData;
  const out = {};
  for (const k of Object.keys(slyData)) out[k] = "<redacted>";
  return out;
}

// Filter sly_data to the subset an `allow` block permits to cross a boundary.
export function filterSlyData(slyData, allowedKeys) {
  if (!slyData) return {};
  if (!allowedKeys || allowedKeys.length === 0) return {};
  if (allowedKeys.includes("*")) return { ...slyData };
  const out = {};
  for (const k of allowedKeys) if (k in slyData) out[k] = slyData[k];
  return out;
}

export function allowedDownstreamSly(agentSpec) {
  return agentSpec?.allow?.to_downstream?.sly_data ?? null;
}
export function allowedUpstreamSly(agentSpec) {
  return agentSpec?.allow?.to_upstream?.sly_data ?? null;
}

// --- external / MCP URL parsing (mirrors external_agent_parsing.py) ----------

export function isExternalAgent(ref) {
  if (typeof ref !== "string") return false;
  return /^https?:\/\//i.test(ref) || ref.startsWith("/");
}

export function isMcpTool(ref) {
  if (isPlainObject(ref)) return true;
  if (typeof ref !== "string") return false;
  if (!/^https?:\/\//i.test(ref)) return false;
  try {
    const u = new URL(ref);
    const hostLabels = u.hostname.toLowerCase().split(".");
    const pathSegs = u.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
    return hostLabels.includes("mcp") || pathSegs.includes("mcp");
  } catch {
    return false;
  }
}

// Parse "https://host:port/agents/name" or "/name" into its parts.
export function parseExternalAgent(ref, baseOrigin) {
  if (ref.startsWith("/")) {
    const origin = baseOrigin || (typeof location !== "undefined" ? location.origin : "");
    return { origin, agentName: ref.replace(/^\//, ""), url: origin + ref };
  }
  const u = new URL(ref);
  return { origin: u.origin, agentName: u.pathname.replace(/^\//, ""), url: ref };
}

// --- config filter chain (mirrors the *ConfigFilter classes) -----------------

// Expand commondefs.replacement_strings ({token}) and replacement_values, then
// push top-level defaults down onto each agent spec, mirroring DefaultsConfigFilter.
const DEFAULT_KEYS = [
  "llm_config",
  "verbose",
  "max_steps",
  "max_iterations",
  "max_execution_seconds",
  "max_attempts",
  "error_formatter",
  "error_fragments",
];

export function filterConfig(rawConfig) {
  let config = deepClone(rawConfig);
  const commondefs = config.commondefs || {};
  const strs = commondefs.replacement_strings || {};
  const vals = commondefs.replacement_values || {};

  config = walkReplace(config, (v) => {
    if (typeof v === "string") {
      // full-value replacement_values match first
      if (Object.prototype.hasOwnProperty.call(vals, v)) return vals[v];
      // {token} string substitution
      return v.replace(/\{([A-Za-z0-9_]+)\}/g, (m, key) =>
        Object.prototype.hasOwnProperty.call(strs, key) ? strs[key] : m
      );
    }
    return v;
  });

  // push down defaults
  const tools = Array.isArray(config.tools) ? config.tools : [];
  for (const agent of tools) {
    for (const key of DEFAULT_KEYS) {
      if (key in config) {
        if (isPlainObject(config[key]) && isPlainObject(agent[key])) {
          agent[key] = deepMerge(config[key], agent[key]);
        } else if (!(key in agent)) {
          agent[key] = deepClone(config[key]);
        }
      }
    }
    // name correction: trim whitespace
    if (typeof agent.name === "string") agent.name = agent.name.trim();
    normalizeConfiguredModel(agent.llm_config);
  }
  normalizeConfiguredModel(config.llm_config);
  return config;
}

// A blank or quoted-empty model_name ("  ", '""') becomes "", so it counts as not set
// and falls back to the network's model. Both runners and the settings panel read
// this config, so they all fall back the same way.
function normalizeConfiguredModel(llmConfig) {
  if (isPlainObject(llmConfig) && typeof llmConfig.model_name === "string") {
    llmConfig.model_name = normalizeModelName(llmConfig.model_name);
  }
}

function walkReplace(v, fn) {
  if (Array.isArray(v)) return v.map((x) => walkReplace(x, fn));
  if (isPlainObject(v)) {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = walkReplace(val, fn);
    return out;
  }
  return fn(v);
}

function deepClone(v) {
  return typeof structuredClone === "function"
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));
}

// --- AgentNetwork (mirrors internals/graph/registry/agent_network.py) --------

export class AgentNetwork {
  constructor(config, name) {
    this.config = filterConfig(config);
    this.name = name;
    this.linkSlots = new Set(Object.keys(this.config.link_slots || {}));
    this.links = { ...(this.config.links || {}) };
    this.linkLabels = { ...(this.config.link_labels || {}) };
    this.specMap = new Map();
    for (const agent of this.config.tools || []) {
      if (agent && typeof agent.name === "string") this.specMap.set(agent.name, agent);
    }
  }

  getAgentSpec(name) {
    return this.specMap.get(name) || null;
  }

  // Delegates to the cross-compiled kernel (neuro_san/kernel/graph.py).
  findFrontMan() {
    return find_front_man(this.config);
  }

  // Delegates classification to the cross-compiled kernel, then attaches the
  // local agent spec (needed by the runner) for non-remote/non-mcp kinds.
  classifyTool(ref) {
    let kind = classify_tool(this.config, ref);
    if (kind === "missing" && typeof ref === "string" && this.linkSlots.has(ref)) kind = "link";
    const spec = typeof ref === "string" ? this.specMap.get(ref) : undefined;
    return { kind, ref, spec };
  }

  getLink(ref) {
    return this.links[ref] || null;
  }

  setLink(ref, target) {
    if (this.linkSlots.has(ref)) this.links[ref] = target;
  }

  metadata() {
    return this.config.metadata || {};
  }
}

// --- validators (mirrors the validator chain) --------------------------------

export function validateNetwork(network) {
  // Errors come from the cross-compiled kernel (neuro_san/kernel/validation.py).
  const errors = validate_network(network.config).filter((message) =>
    ![...network.linkSlots].some((ref) => message.includes(`references missing tool '${ref}'.`))
  );
  const warnings = [];

  // The externals/mcps list (for the trace's cross-origin permission view) is a
  // browser-side concern, scanned here.
  const externals = [];
  const mcps = [];
  for (const agent of network.config.tools || []) {
    for (const ref of agent.tools || []) {
      const c = network.classifyTool(ref);
      if (c.kind === "remote") externals.push(ref);
      else if (c.kind === "mcp") mcps.push(typeof ref === "string" ? ref : ref.url);
    }
  }
  return { errors, warnings, externals, mcps };
}
