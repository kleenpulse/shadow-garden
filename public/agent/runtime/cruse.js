// Changed by agentic-web. See README.md in this folder for what changed.
// CRUSE's wire contract. Proposals are returned to the caller, never published
// directly to the user by a child agent. This module is shared by both runners.
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const kinds = new Set(["form", "choice", "confirm", "info", "report", "table", "chart", "html", "action"]);

export function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  try { return JSON.parse(text.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, "$1")); } catch {}
  return null;
}

export function isPresentation(value) {
  return object(value) && (Array.isArray(value.components) || object(value.schema?.properties) || kinds.has(value.kind) || object(value.fields));
}

function validComponent(c) {
  if (!object(c) || !kinds.has(c.kind)) return false;
  if (c.submit && (c.kind !== "form" || !Array.isArray(c.submit.actions) || !c.submit.actions.length)) return false;
  if (c.kind === "action") return typeof c.action === "string" && (!c.arguments || object(c.arguments));
  if (c.kind === "form") {
    const p = c.schema?.properties;
    return object(p) && Object.keys(p).length > 0 && Object.keys(p).length <= 40 &&
      Object.values(p).every((f) => object(f) &&
        (!f.type || ["string", "number", "integer", "boolean", "array"].includes(f.type)) &&
        (!f.enum || Array.isArray(f.enum))) &&
      (!c.schema.required || (Array.isArray(c.schema.required) && c.schema.required.every((k) => Object.hasOwn(p, k))));
  }
  if (c.kind === "choice") return Array.isArray(c.options) && c.options.length > 0 && c.options.every(object);
  if (c.kind === "confirm") return typeof c.confirmText === "string" && !!c.confirmText.trim();
  if (c.kind === "info") return object(c.fields);
  if (c.kind === "report") return typeof c.markdown === "string";
  if (c.kind === "html") return typeof c.html === "string";
  if (c.kind === "table") return Array.isArray(c.columns) && c.columns.length > 0 &&
    c.columns.every((s) => typeof s === "string") && Array.isArray(c.rows) &&
    c.rows.every((r) => Array.isArray(r) && r.length === c.columns.length && r.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  if (c.kind === "chart") return ["bar", "line"].includes(c.chartType) &&
    typeof c.summary === "string" && !!c.summary.trim() &&
    Array.isArray(c.labels) && c.labels.length > 0 && c.labels.length <= 120 &&
    c.labels.every((s) => typeof s === "string") && Array.isArray(c.series) && c.series.length > 0 && c.series.length <= 8 &&
    c.series.every((s) => object(s) && typeof s.name === "string" && Array.isArray(s.values) &&
      s.values.length === c.labels.length && s.values.every((v) => typeof v === "number" && Number.isFinite(v)));
  return false;
}

// Exact duplicates are safe to remove mechanically. Semantic merging belongs to
// the parent LLM: similar labels can still describe distinct people or actions.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
}

export function normalizePresentation(value, prefix = "component") {
  const components = [];
  const issues = [];
  const seen = new Set();
  const ids = new Set();
  const candidates = Array.isArray(value?.components) ? value.components : [value];
  if (value?.version !== undefined && value.version !== 1) return { presentation: null, issues: ["Unsupported presentation version."] };
  for (const candidate of candidates) {
    if (candidate?.display === false) continue;
    const c = object(candidate) ? { ...candidate, kind: candidate.kind || (candidate.schema ? "form" : "info") } : null;
    // Older confirm widgets used their label as the message.
    if (c?.kind === "confirm" && !c.confirmText) c.confirmText = c.confirmLabel || "Confirm";
    if (!validComponent(c)) { issues.push(`Invalid ${c?.kind || "presentation"} component${c?.title ? `: ${c.title}` : ""}.`); continue; }
    const key = JSON.stringify(canonical(c));
    if (seen.has(key)) continue;
    seen.add(key);
    let id = typeof c.id === "string" && /^[\w.-]{1,100}$/.test(c.id) ? c.id : `${prefix}-${components.length + 1}`;
    while (ids.has(id)) id += "-next";
    ids.add(id);
    components.push({ ...c, id });
  }
  return { presentation: components.length ? { version: 1, components } : null, issues };
}

// Preserve child intake widgets when the coordinator finishes with prose.
// Combine compatible answer-only forms; action forms keep their own bindings.
export function consolidateIntakePresentations(presentations) {
  const components = [];
  let intake;
  for (const presentation of presentations) {
    for (const component of presentation.components || []) {
      if (component.kind !== "form" || component.submit) {
        components.push(component);
        continue;
      }
      const properties = component.schema.properties;
      const compatible = intake && Object.entries(properties).every(([key, schema]) =>
        !Object.hasOwn(intake.schema.properties, key)
        || JSON.stringify(canonical(intake.schema.properties[key])) === JSON.stringify(canonical(schema)));
      if (!compatible || Object.keys({ ...intake?.schema.properties, ...properties }).length > 40) {
        intake = { ...component, schema: { ...component.schema,
          properties: { ...properties }, required: [...(component.schema.required || [])] } };
        components.push(intake);
      } else {
        Object.assign(intake.schema.properties, properties);
        intake.schema.required = [...new Set([...intake.schema.required, ...(component.schema.required || [])])];
      }
    }
  }
  return normalizePresentation({ version: 1, components }).presentation;
}

// Preserve AAOSA metadata for parent agents, while exposing its human answer to
// the UI. Handle presentation fences inside Response as well as outside it.
export function parseAgentResponse(raw, source = {}) {
  let text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  const proposals = [];
  const issues = [];
  let protocol;
  const strip = (input) => input.replace(/```(cruse-ui|json)\s*([\s\S]*?)```/gi, (full, label, body) => {
    const value = parseJson(body.trim());
    if (label.toLowerCase() === "json" && !isPresentation(value)) return full;
    if (value && isPresentation(value)) proposals.push(value);
    else issues.push("The presentation could not be parsed.");
    return "";
  }).replace(/```cruse-ui[\s\S]*$/i, () => { issues.push("The presentation was incomplete."); return ""; }).trim();

  const unwrap = (input) => {
    const plain = input.replace(/<\/?tool_(?:response|call)>/gi, "").trim();
    const match = plain.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    const doc = parseJson(match ? match[1] : plain);
    // Some providers return the structured composition directly, without fences.
    if (isPresentation(doc) || isPresentation(doc?.presentation)) {
      proposals.push(isPresentation(doc?.presentation) ? doc.presentation : doc);
      return typeof doc.text === "string" ? doc.text : "";
    }
    if (object(doc) && doc.Mode !== undefined && (doc.Name !== undefined || doc.Inquiry !== undefined)) {
      protocol = doc;
      if (object(doc.Response)) return unwrap(JSON.stringify(doc.Response));
      return typeof doc.Response === "string" ? doc.Response : Array.isArray(doc.Requirements)
        ? doc.Requirements.map((r) => typeof r === "string" ? r : r?.description || r?.title || "").filter(Boolean).join("\n") : "";
    }
    return plain;
  };
  // Unwrap first for escaped fences embedded in a JSON string, then retry after
  // stripping any fences placed beside an AAOSA envelope.
  text = strip(unwrap(text));
  if (!protocol) text = strip(unwrap(text));
  const merged = [];
  for (const proposal of proposals) {
    const normalized = normalizePresentation(proposal, source.invocation || "component");
    issues.push(...normalized.issues);
    merged.push(...(normalized.presentation?.components || []));
  }
  const { presentation } = normalizePresentation({ version: 1, components: merged }, source.invocation || "component");
  if (!text && !presentation && issues.length) text = "I couldn’t display that response. Please ask me to try again.";
  if (protocol && typeof protocol.Response === "string") protocol = { ...protocol, Response: text };
  return { cruse: 1, text, presentation, source, ...(protocol ? { protocol } : {}),
    ...(issues.length ? { presentationIssues: issues, unrenderedProposals: proposals } : {}) };
}

export function agentPresentationContext(ctx, agentName) {
  const spec = ctx.network.getAgentSpec(agentName);
  if (!ctx.network.config?.cruse && !spec?.instructions?.includes("GENERATIVE UI (CRUSE)")) return "";
  return `CRUSE invocation context (takes precedence over earlier presentation preferences):
Audience: ${ctx.isTop && agentName === ctx.frontMan ? "the user" : "your parent agent; your presentation is a proposal, not directly displayed"}.
The render_cruse tool is available to create widgets directly. When collecting multiple missing details, call render_cruse with ONE consolidated form, then finish with a brief introduction. Widgets submitted through this tool are preserved even if your final answer is plain text. A final answer or tool receipt must not claim that collecting form details places an order. For information-only requests, choose a useful component when it helps; do not ask for checkout details prematurely.
Tool results may contain {cruse:1,text,presentation,protocol,source}. Read all relevant child answers AND presentation components. During your normal final synthesis, consolidate them into your own presentation. Merge redundant questions by meaning, use facts already supplied, preserve distinct requirements and disagreements, and defer details needed only for later steps. Do not copy a stack of child forms. You may replace proposed forms with prose, a table, report or chart, or omit a presentation when chat suffices. Prefer one focused input step when input is needed, with complementary visual components when useful. Plain chat can answer or amend a form; never require form submission just to continue. If presentationIssues or unrenderedProposals are present, recover useful facts and requirements into your answer or a valid presentation. Return human-facing text and optionally one consolidated cruse-ui block; child protocol metadata is context, not another UI. Never invent data to fill a chart or report.`;
}

export function interactionMessage(text, interaction) {
  return interaction ? `${text}\n\nCRUSE interaction: ${JSON.stringify(interaction)}` : text;
}
