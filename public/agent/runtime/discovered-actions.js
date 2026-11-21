// Static, publisher-approved HTTP descriptions. Never evaluate website/model code.
import { cloneData, validateData } from "./actions.js";
import { sha256Hex } from "./web-crypto.js";

function url(value) {
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password || u.hash || value.includes("\\")) throw new Error("Invalid discovered endpoint.");
  return u;
}
async function read(response, limit = 65536) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Action response exceeded its size limit; outcome may be unknown.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
const options = signal => ({ signal, credentials: "omit", mode: "cors", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
async function formFingerprint(form) {
  const attributes = node => Object.fromEntries([...node.attributes].map(a => [a.name, a.value]));
  const contract = { attributes: attributes(form), controls: [...form.querySelectorAll("input,select,textarea,button,option")].map(n => ({
    tag: n.tagName.toLowerCase(), attributes: attributes(n), ...(n.tagName === "OPTION" ? { text: n.textContent } : {}),
  })) };
  return sha256Hex(JSON.stringify(canonical(contract)));
}
async function formRequest(request, args, signal) {
  const response = await fetch(url(request.page), options(signal));
  if (!response.ok) throw new Error(`Cannot refresh source form: HTTP ${response.status}. No submission sent.`);
  const doc = new DOMParser().parseFromString(await read(response, 2_000_000), "text/html");
  const source = doc.forms[request.index];
  if (!source || await formFingerprint(source) !== request.fingerprint) throw new Error("Source form changed. Rebuild with --action-refresh and review it. No submission sent.");
  const form = document.importNode(source, true);
  for (const node of form.querySelectorAll("input,textarea,select")) {
    if (!node.name || node.disabled) continue;
    const value = args[node.name];
    if (node.type === "checkbox" || node.type === "radio") node.checked = (Array.isArray(value) ? value : [value]).includes(node.value);
    else if (node.tagName === "SELECT" && node.multiple) {
      for (const option of node.options) option.selected = (value || []).includes(option.value);
    } else {
      const supplied = value === undefined ? "" : String(value);
      node.value = supplied;
      // Native time/date/number inputs silently clear invalid strings. Reject
      // that conversion instead of sending a different value for an optional field.
      if (node.value !== supplied) throw new Error(`Invalid native form value for ${node.name}. No submission sent.`);
    }
  }
  if (!form.checkValidity()) throw new Error("Form values violate the source website's constraints. No submission sent.");
  const data = new URLSearchParams(new FormData(form));
  const endpoint = url(request.url);
  if (request.method === "GET") { endpoint.search = data.toString(); return { endpoint, init: {} }; }
  return { endpoint, init: { body: data } };
}
function apiRequest(request, args) {
  let template = request.url;
  for (const field of request.bindings.filter(f => f.in === "path")) {
    const value = String(args[field.name]);
    if (!/^[-a-zA-Z0-9_.~]+$/.test(value) || [".", ".."].includes(value)) throw new Error("Unsafe API path parameter.");
    template = template.replaceAll(`{${field.name}}`, encodeURIComponent(value));
  }
  if (/[{}]/.test(template)) throw new Error("Unresolved API path parameter.");
  const endpoint = url(template), body = {};
  if (endpoint.origin !== url(request.url).origin) throw new Error("API endpoint origin changed.");
  for (const field of request.bindings) {
    if (!Object.hasOwn(args, field.name)) continue;
    let value = args[field.name];
    if (field.in === "query") endpoint.searchParams.set(field.name, String(value));
    if (field.in === "body") {
      if (request.jsonFields.includes(field.name)) {
        value = cloneData(JSON.parse(value));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field.name} must contain a JSON object.`);
      }
      body[field.name] = value;
    }
  }
  return { endpoint, init: request.body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {} };
}
function evidence(text, contentType) {
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text, (key, value) => /password|secret|token|authorization|cookie|api.?key/i.test(key) ? "[redacted]" : value);
    } catch { return { note: "Response declared JSON but could not be parsed." }; }
  }
  if (contentType.includes("html")) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script,style,form,iframe,object").forEach(n => n.remove());
    return doc.body.textContent.trim().slice(0, 16000);
  }
  return text.slice(0, 16000);
}
export function registerDiscoveredActions(actions, document, callerOrigins = []) {
  if (document.version !== 1 || !Array.isArray(document.actions) || document.actions.length > 100) throw new Error("Invalid discovered action catalog.");
  for (const candidate of document.actions) {
    if (candidate.enabled !== true) continue;
    const action = cloneData(candidate), request = action.request;
    url(request.url);
    if (!["form", "http"].includes(request.kind) || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method)) throw new Error("Unsupported discovered request.");
    if (request.kind === "form" && (url(request.page).origin !== url(request.url).origin || !["GET", "POST"].includes(request.method))) throw new Error("Invalid form destination.");
    actions.register({ name: action.name, description: action.description, inputSchema: action.inputSchema,
      effect: action.effect, availability: action.effect === "read" ? "bridge" : "top-level", callerOrigins,
      execute: async (args, { signal }) => {
        validateData(action.inputSchema, args);
        const { endpoint, init } = request.kind === "form" ? await formRequest(request, args, signal) : apiRequest(request, args);
        const response = await fetch(endpoint, { ...options(signal), method: request.method, ...init });
        const text = await read(response, 48000);
        return { state: "response_received", businessOutcome: "unverified", httpStatus: response.status, httpOk: response.ok,
          method: request.method, url: endpoint.href, data: evidence(text, response.headers.get("content-type") || "") };
      },
    });
  }
}

export async function loadDiscoveredActions(actions, catalogUrl, callerOrigins = []) {
  const response = await fetch(catalogUrl, options());
  if (!response.ok) throw new Error(`Discovered action catalog unavailable: HTTP ${response.status}.`);
  registerDiscoveredActions(actions, JSON.parse(await read(response, 2_000_000)), callerOrigins);
}
