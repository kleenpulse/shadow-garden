// Site-owned executable capabilities. Agent output is data, never executable code.
// Changed by agentic-web. See README.md in this folder for what changed.
export const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const badKeys = new Set(["__proto__", "prototype", "constructor"]);
export function cloneData(value) {
  const text = JSON.stringify(value);
  if (!text || text.length > 65536) throw new Error("Action data exceeds 64 KB.");
  return JSON.parse(text, (key, v) => {
    if (badKeys.has(key)) throw new Error("Unsafe object key.");
    return v;
  });
}

// A deliberately bounded JSON Schema subset; unsupported validation keywords fail
// at registration instead of being silently ignored. UI annotations are harmless.
const keywords = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "format", "title", "description", "default"]);
export function checkSchema(schema, depth = 0) {
  if (!plain(schema) || depth > 8) throw new Error("Invalid action schema.");
  for (const key of Object.keys(schema)) if (!keywords.has(key) && !key.startsWith("x-")) throw new Error(`Unsupported action schema keyword: ${key}`);
  if (!["object", "array", "string", "integer", "number", "boolean"].includes(schema.type)) throw new Error("Action schema requires a supported type.");
  if (schema.enum && (!Array.isArray(schema.enum) || !schema.enum.length)) throw new Error("Invalid enum.");
  if (schema.format && !["date", "email"].includes(schema.format)) throw new Error("Supported formats: date, email.");
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
    if (schema[key] !== undefined && !Number.isFinite(schema[key])) throw new Error(`Invalid ${key}.`);
  }
  if (schema.type === "object") {
    if (!plain(schema.properties)) throw new Error("Object schema requires properties.");
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) throw new Error("Action objects must reject extra fields.");
    if (schema.required && (!Array.isArray(schema.required) || schema.required.some(k => !Object.hasOwn(schema.properties, k)))) throw new Error("Invalid required fields.");
    Object.values(schema.properties).forEach(s => checkSchema(s, depth + 1));
  }
  if (schema.type === "array") checkSchema(schema.items, depth + 1);
}
export function validateData(schema, value, path = "arguments") {
  const fail = () => { throw new Error(`Invalid ${path}.`); };
  if (schema.type === "object") {
    if (!plain(value)) fail();
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw new Error(`Missing ${path}.${key}.`);
    for (const [key, v] of Object.entries(value)) {
      if (badKeys.has(key) || !Object.hasOwn(schema.properties, key)) throw new Error(`Unexpected ${path}.${key}.`);
      validateData(schema.properties[key], v, `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 1000)) fail();
    value.forEach((v, i) => validateData(schema.items, v, `${path}[${i}]`));
  } else if (schema.type === "integer" || schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value)) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) fail();
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? 65536)) fail();
    if (schema.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail();
    if (schema.format === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) fail();
  } else if (typeof value !== "boolean") fail();
  if (schema.enum && !schema.enum.some(v => JSON.stringify(v) === JSON.stringify(value))) fail();
}

export function actionBindings(component) {
  if (component.kind === "action") return [{ action: component.action, arguments: component.arguments || {} }];
  return component.submit?.actions || [];
}
export function proposalRefs(result) {
  return (result?.presentation?.components || []).flatMap(c => actionBindings(c).map(b => b.action));
}
export function actionContext(catalog) {
  if (!catalog.length) return "\nNo browser actions are registered for this network. Forms can collect information only. Do not say availability/menu data was checked or an operation ran. Report missing integration explicitly. Validated proposals from children may still be relayed.\n";
  return `\nCRUSE browser actions (proposals only; these are NOT tool calls):\n${JSON.stringify(catalog)}\nReturn proposals in the ordinary version:1 cruse-ui components. A ready action is {kind:"action",id:"save",action:"EXACT ref",label:"Save",arguments:{...}}. A form may have submit:{actions:[{action:"EXACT ref",arguments:{knownValue:123},inputs:{argumentName:"fieldName"}}]}. inputs maps argument names to top-level form field names, not expressions. Use inputSchema for field types, enum choices and constraints. Preserve exact action references from this catalog or validated child proposals. Consolidate child/local forms and their submit.actions into one form where useful. Keep the mappings when renaming fields. An action proposal never means completion. Submission is executed by the browser after user review; only returned receipts establish results. Do not collect passwords, tokens or payment credentials in CRUSE. Never invent handlers, destinations or successful receipts.`;
}

export class ActionRegistry {
  constructor() { this.entries = new Map(); this.sequence = 0; this.discoveryIssues = []; }
  register(scope, definition, execute = definition.execute) {
    const { name, description, inputSchema, outputSchema, effect = "write", availability = "local-only", callerOrigins = [], timeoutMs = 180000, confirmsInWindow = false } = cloneData(definition);
    if (!/^[A-Za-z][\w-]{0,79}$/.test(name || "") || !description || typeof execute !== "function") throw new Error("Action requires name, description and execute function.");
    if (!["read", "write", "irreversible"].includes(effect) || !["local-only", "bridge", "top-level"].includes(availability)) throw new Error("Invalid action policy.");
    if (!Array.isArray(callerOrigins) || callerOrigins.some(o => o !== "*" && new URL(o).origin !== o)) throw new Error("callerOrigins must contain exact origins.");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) throw new Error("timeoutMs must be 100–300000.");
    checkSchema(inputSchema);
    if (inputSchema.type !== "object") throw new Error("Action input must be an object.");
    if (outputSchema) checkSchema(outputSchema);
    const ref = `${scope.base.replace(/\/$/, "")}/${encodeURIComponent(scope.network)}#${name}`;
    if (this.entries.has(ref)) throw new Error(`Duplicate action: ${name}`);
    // confirmsInWindow: the action shows its own confirmation. Only a bridge in the site's
    // own top-level window honors it (action-transport.js).
    const entry = { ref, name, description, inputSchema, outputSchema, effect, availability, callerOrigins, timeoutMs, confirmsInWindow: confirmsInWindow === true, ...scope, execute };
    this.entries.set(ref, entry);
    return ref;
  }
  catalog(scope) {
    return [...this.entries.values()].filter(e => e.base === scope.base && e.network === scope.network).map(({ ref, name, description, inputSchema, effect, availability }) => cloneData({ ref, name, description, inputSchema, effect, availability }));
  }
  validatePresentation(result, allowed) {
    const issues = [];
    if (result.presentation) result.presentation.components = result.presentation.components.filter(c => {
      try {
        const bindings = actionBindings(c);
        if (!Array.isArray(bindings) || bindings.length > 12) throw new Error("Invalid action list.");
        for (const b of bindings) {
          if (!plain(b) || !allowed.has(b.action) || !this.entries.has(b.action)) throw new Error("Action is not available to this invocation.");
          if (Object.keys(b).some(k => !["action", "arguments", "inputs"].includes(k))) throw new Error("Unknown action binding field.");
          const args = cloneData(b.arguments || {});
          if (!plain(args) || (b.inputs !== undefined && !plain(b.inputs))) throw new Error("Invalid arguments or input mapping.");
          for (const [key, field] of Object.entries(b.inputs || {})) {
            if (c.kind !== "form" || typeof field !== "string" || !Object.hasOwn(c.schema.properties, field) || Object.hasOwn(args, key)) throw new Error("Invalid field mapping.");
            if (!Object.hasOwn(this.entries.get(b.action).inputSchema.properties, key)) throw new Error("Unknown action argument.");
          }
          const schema = this.entries.get(b.action).inputSchema;
          for (const [key, value] of Object.entries(args)) {
            if (!Object.hasOwn(schema.properties, key)) throw new Error("Unknown action argument.");
            validateData(schema.properties[key], value, key);
          }
          for (const key of schema.required || []) if (!Object.hasOwn(args, key) && !Object.hasOwn(b.inputs || {}, key)) throw new Error(`Missing action argument: ${key}`);
        }
        return true;
      } catch (err) { issues.push(err.message); return false; }
    });
    if (issues.length) result.presentationIssues = [...(result.presentationIssues || []), ...issues];
    if (result.presentation?.components.length === 0) {
      result.presentation = null;
      if (!result.text) result.text = "The proposed action could not be validated. Please ask me to try again.";
    }
    return result;
  }
  prepare(component, values = {}) {
    values = cloneData(values);
    return actionBindings(component).map(b => {
      const entry = this.entries.get(b.action);
      if (!entry) throw new Error("Action is no longer available.");
      const args = cloneData(b.arguments || {});
      for (const [key, field] of Object.entries(b.inputs || {})) if (Object.hasOwn(values, field)) args[key] = values[field];
      validateData(entry.inputSchema, args);
      return { entry, args };
    });
  }
  async execute(plan, confirm, invocationId) {
    // Confirm the immutable complete payload before any action begins.
    if (!await confirm(plan.map(({ entry, args }) => ({ action: entry.name, description: entry.description, origin: new URL(entry.base).origin, effect: entry.effect, arguments: cloneData(args) })))) return null;
    const receipts = [];
    for (let i = 0; i < plan.length; i++) {
      const { entry, args } = plan[i];
      const requestId = `${invocationId}:${i}`;
      const controller = new AbortController();
      let timer;
      try {
        const result = cloneData(await Promise.race([
          Promise.resolve().then(() => entry.execute(cloneData(args), { requestId, signal: controller.signal })),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Action timed out; outcome unknown. Check the site before retrying.")); }, entry.timeoutMs); }),
        ]));
        if (entry.outputSchema) validateData(entry.outputSchema, result, "result");
        receipts.push({ action: entry.ref, requestId, status: "succeeded", result });
      } catch (error) {
        // The server may have committed before the connection failed. Never retry.
        receipts.push({ action: entry.ref, requestId, status: "unknown", error: String(error.message || error) });
        for (const { entry: rest } of plan.slice(i + 1)) receipts.push({ action: rest.ref, status: "not_started" });
        break;
      } finally { clearTimeout(timer); }
    }
    return receipts;
  }
}
