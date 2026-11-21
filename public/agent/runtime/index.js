// index.js — public entry point for the neuro-san-web runtime.
// Changed by agentic-web. See README.md in this folder for what changed.
//
// A business's index.html imports `boot` and points it at its origin. boot loads
// the origin's published network, compiles it, mounts the themeable UI, and is
// ready to run — entirely in the browser, with no agent server.

export { Engine } from "./engine.js";
export { TraceBus } from "./trace.js";
export { mountApp } from "./ui.js";
export { AgentNetwork, validateNetwork, ChatMessageType } from "./kernel.js";
export { parseHocon } from "./hocon.js";
export { ActionRegistry } from "./actions.js";

import { Engine } from "./engine.js";
import { TraceBus } from "./trace.js";
import { mountApp } from "./ui.js";
import { getSelectedByokProfile, loadTabByokSetup } from "./byok.js";
import { OpenRouterConnect } from "./openrouter-connect.js";

export async function boot(rootSelector = "#app", opts = {}) {
  // Finish an OpenRouter sign-in first. It takes the one-time code out of the address
  // and saves the new key, so the URL and the setup read below are the final ones.
  const connect = await OpenRouterConnect.finish();
  const root = typeof rootSelector === "string" ? document.querySelector(rootSelector) : rootSelector;
  if (!root) throw new Error("Agent widget mount not found.");
  root.setAttribute("data-nsdeploy-ui", "");
  const trace = new TraceBus();
  const params = new URLSearchParams(location.search);
  // Key, router and model come from the hosting page (opts), the setup applied in
  // this tab or the saved BYOK profile, never from the URL, so a link cannot choose
  // where the key is sent or which model it pays for. A key in the URL is removed
  // from the address bar so it does not stay in history. Router and model stay,
  // because a host page may use those names for its own parameters.
  const ignoredParams = [];
  // Note each setting found in the URL. Its value is never read or logged.
  for (const name of ["key", "router", "model"]) {
    if (params.has(name)) ignoredParams.push(name);
  }
  if (params.has("key")) {
    params.delete("key");
    const qs = params.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch {}
  }
  if (ignoredParams.length) {
    const names = ignoredParams.join(", ");
    console.warn(`Inference settings in the page URL are ignored (${names}). Set them in AI model settings.`);
  }
  const savedProfile = getSelectedByokProfile();
  const tabSetup = loadTabByokSetup(savedProfile);
  const siteBase = (opts.originUrl || location.origin).replace(/\/$/, "");
  const engine = new Engine({
    originUrl: siteBase,
    trace,
    sandboxWorkerUrl: opts.sandboxWorkerUrl || "/runtime/sandbox-worker.js",
    byokKey: opts.byokKey || tabSetup.key,
    routerOverride: opts.router || tabSetup.router,
    modelOverride: opts.model || tabSetup.model,
  });
  // Select the agent loop: ?runner=langchain drives the LLM via LangChain.js
  // (neuro-san-web owns the loop). 'langgraph' kept as an alias for older links.
  // A saved setup's runner flag is ignored, because the panel has no setting to turn it off.
  const runnerChoice = opts.runner || params.get("runner") || "";
  const { manifest } = await engine.loadTop();
  if (manifest?.deployment?.mode !== "static"
      && (runnerChoice === "langchain" || runnerChoice === "langgraph")) {
    await engine.enableLangChain();
  }
  mountApp(root, {
    engine,
    trace,
    manifest,
    connect,
  });
  {
    const status = document.createElement("details");
    status.className = "ns-action-status";
    status.style.cssText = "flex:none;padding:8px 12px;font-size:12px;max-height:140px;overflow:auto";
    const summary = document.createElement("summary");
    const detail = document.createElement("p");
    const list = document.createElement("p");
    list.className = "ns-action-list";
    // website_* tools (runner.js) ask only before irreversible actions. Buttons and forms
    // the visitor submits are always reviewed first.
    const directTools = !!manifest?.actions?.agentTools?.length;
    const reviewed = directTools
      ? "You confirm actions that cannot be undone before they run. Other actions run right away."
      : "Actions run after you review and confirm them. Server responses appear as receipts.";
    const update = () => {
      const actions = engine.actions.catalog({ base: engine.top.base, network: engine.top.network.name });
      const count = actions.length;
      summary.textContent = count ? `${count} website actions connected` : "No website actions connected";
      detail.textContent = engine.actions.discoveryIssues.map(i => `${i.page}: ${i.reason}`).join(" ") || (count
        ? reviewed
        : "This agent can collect information, but no website operations are connected.");
      // Name each action, so the visitor sees what the assistant can do on this page.
      // With website_* tools only irreversible actions ask first, so only those are marked.
      const names = [];
      for (const action of actions) {
        const name = String(action.name).replace(/_/g, " ");
        names.push(directTools && action.effect === "irreversible" ? `${name} (asks you first)` : name);
      }
      list.textContent = names.length ? `Actions: ${names.join(", ")}.` : "";
      list.hidden = !names.length;
    };
    engine.actions.onChange = update;
    update();
    status.append(summary, detail, list); (root.querySelector(".ns-chat") || root).prepend(status);
  }
  // expose for debugging / e2e tests
  if (typeof window !== "undefined") window.__nsweb = { engine, trace };
  return { engine, trace, actions: {
    register: definition => {
      const ref = engine.actions.register({ base: engine.top.base, network: engine.top.network.name }, definition);
      engine.actions.onChange?.();
      return ref;
    },
    refreshHostForms: () => engine.actions.hostForms?.refresh(),
  } };
}
