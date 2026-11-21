// ui.js — the themeable chat + execution-trace inspector.
// Changed by agentic-web. See README.md in this folder for what changed.
//
// Renders three surfaces from the trace bus: a chat pane, a live network/origin
// graph, and a chronological execution log. Businesses restyle via CSS variables
// (--ns-primary, --ns-bg, --ns-font, etc.) set on the host page; this module
// imposes layout, not brand.

import { ChatMessageType } from "./kernel.js";
import {
  canUseByokCookie,
  deleteByokProfile,
  getSelectedByokProfile,
  guessByokProfileName,
  loadByokStore,
  loadTabByokSetup,
  portableByokRouter,
  resolveByokRouter,
  saveTabByokSetup,
  selectByokProfile,
  upsertByokProfile,
} from "./byok.js";
import { effectiveModel, isPlaceholderModel, normalizeModelName } from "./model.js";
import { normalizePresentation } from "./cruse.js";
import { PRESENTATION_CSS, renderMarkdown, renderRichComponent } from "./cruse-render.js";
import { createTurnStatusController } from "./turn-status.js";
import { reviewActions, setActionWindowPrompt } from "./action-transport.js";
import { OpenRouterConnect } from "./openrouter-connect.js";
import { InUseLine } from "./in-use-line.js";

export const AI_MODEL_SETTINGS_LABEL = "AI model settings";
export const API_KEY_HELP_URL = "https://ai.google.dev/gemini-api/docs/api-key";
export const API_KEY_PROVIDERS = [
  // First, because sites built with the agentify-website skill use hosted Otari by default.
  // Only hosted Otari keys start with "otk_". A self-hosted Otari's keys start with "tk-"
  // and belong to the visitor's own Otari, so they are not matched here.
  {
    name: "Otari",
    keyUrl: "https://otari.ai/dashboard#/keys",
    router: "https://api.otari.ai/api/v1",
    model: "alibaba/qwen3.8-flash",
    keyPrefixes: ["otk_"],
    accessNote: "Billing may be required",
  },
  // An otari.ai key belongs to one region, and the other region's gateway refuses it with
  // HTTP 421. EU keys start with "otk_v1_eu_" and go to the EU gateway. This entry has no
  // button, because visitors make keys for both regions on the same Otari dashboard.
  {
    name: "Otari EU",
    keyUrl: "https://otari.ai/dashboard#/keys",
    router: "https://eu.api.otari.ai/api/v1",
    model: "alibaba/qwen3.8-flash",
    keyPrefixes: ["otk_v1_eu_"],
    accessNote: "Billing may be required",
    button: false,
  },
  {
    name: "Google AI Studio",
    keyUrl: "https://aistudio.google.com/apikey",
    router: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "models/gemini-3.8-flash",
    keyPrefixes: ["AIza"],
    accessNote: "Free tier",
  },
  {
    name: "Groq",
    keyUrl: "https://console.groq.com/keys",
    router: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    keyPrefixes: ["gsk_"],
    accessNote: "Free tier",
  },
  // The Connect with OpenRouter button (openrouter-connect.js) gets a key without pasting.
  // This entry is for a pasted OpenRouter key, and it lets the panel recognize either one.
  {
    name: OpenRouterConnect.NAME,
    keyUrl: "https://openrouter.ai/settings/keys",
    router: OpenRouterConnect.ROUTER,
    model: OpenRouterConnect.MODEL,
    keyPrefixes: [OpenRouterConnect.KEY_PREFIX],
    accessNote: "Free tier",
  },
  {
    name: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    router: "https://api.openai.com/v1",
    model: "gpt-5.5",
    keyPrefixes: ["sk-proj-", "sk-svcacct-"],
    accessNote: "Billing may be required",
  },
  {
    name: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    router: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    keyPrefixes: ["sk-ant-"],
    accessNote: "Billing may be required",
  },
];

// The provider whose longest prefix matches the key, so an Otari EU key finds the EU
// entry and not the general "otk_" one.
export function providerForApiKey(apiKey) {
  const key = String(apiKey || "").trim();
  let match = null;
  let matchLength = 0;
  for (const provider of API_KEY_PROVIDERS) {
    for (const prefix of provider.keyPrefixes) {
      if (key.startsWith(prefix) && prefix.length > matchLength) {
        match = provider;
        matchLength = prefix.length;
      }
    }
  }
  return match;
}

// The providers shown as buttons in the settings panel.
export function providerButtons() {
  return API_KEY_PROVIDERS.filter((provider) => provider.button !== false);
}

const BASE_CSS = PRESENTATION_CSS + `
/* Legacy themes get two resizable panes side by side. Composed themes provide
   header/chat/agents mount slots and own their placement; the runtime continues
   to own the components' internal layout and behavior. */
.ns-app{display:grid;
  grid-template-columns:minmax(300px,var(--ns-mainw,1fr)) 8px minmax(220px,var(--ns-railw,340px));
  grid-template-rows:auto 1fr;column-gap:8px;row-gap:12px;height:100%;min-height:0;
  overflow-x:auto;overflow-y:hidden;
  font-family:var(--ns-font,system-ui,sans-serif);color:var(--ns-fg,#1a1a1a);background:var(--ns-bg,#fff);box-sizing:border-box;padding:12px}
.ns-composed-app{min-width:0;min-height:0;font-family:var(--ns-font,system-ui,sans-serif);color:var(--ns-fg,#1a1a1a)}
.ns-composed-app [data-ns-slot]{box-sizing:border-box;min-width:0;min-height:0}
.ns-composed-app [data-ns-slot="chat"]>.ns-chat{width:100%;height:100%;min-height:480px}
.ns-composed-app [data-ns-slot="agents"]>.ns-agents,
.ns-composed-app [data-ns-slot="agents"]>.ns-dev{box-sizing:border-box;width:100%;height:100%;min-height:0}
.ns-composed-app [data-ns-slot="activity"][hidden]{display:none!important}
.ns-header{grid-column:1/-1;display:flex;align-items:center;gap:12px;border-bottom:2px solid var(--ns-accent,var(--ns-primary,#2563eb));background:var(--ns-header-bg,transparent);color:var(--ns-header-fg,inherit);padding:var(--ns-header-pad,0 0 8px)}
.ns-header .ns-logo{height:32px}
.ns-title{font-weight:700;font-size:18px}
.ns-main{grid-column:1;grid-row:2;min-height:0;min-width:0;overflow:hidden;display:flex;justify-content:center}
.ns-main>.ns-chat{flex:1 1 auto;width:100%;max-width:1100px;min-width:0;min-height:0}
.ns-split{grid-column:2;grid-row:2;align-self:stretch;width:8px;justify-self:center;border-radius:6px;cursor:col-resize;background:var(--ns-border,#e2e2e2);opacity:.5;transition:opacity .15s,background .15s;touch-action:none}
.ns-split:hover,.ns-split.dragging{opacity:1;background:var(--ns-primary,#2563eb)}
.ns-agents{grid-column:3;grid-row:2;display:flex;flex-direction:column;gap:10px;border:1px solid var(--ns-border,#e2e2e2);border-radius:12px;padding:12px;background:var(--ns-panelbg,#fbfcfe);min-height:0;min-width:0;overflow:auto}
:is(.ns-app,.ns-composed-app)[data-dev="true"] .ns-agents{display:none}
.ns-agents h3{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--ns-muted,#888)}
.ns-status{font-size:13px;color:var(--ns-fg,#333);display:flex;align-items:center;gap:8px;min-height:20px}
.ns-status[hidden]{display:none!important}
.ns-status .ns-spin{width:12px;height:12px;border:2px solid var(--ns-primary,#2563eb);border-top-color:transparent;border-radius:50%;animation:ns-spin .8s linear infinite;display:none}
.ns-status.busy .ns-spin{display:inline-block}
@keyframes ns-spin{to{transform:rotate(360deg)}}
.ns-anode{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--ns-border,#e6e6e6);border-radius:10px;background:#fff;cursor:pointer;transition:all .15s}
.ns-anode:hover{border-color:var(--ns-primary,#2563eb)}
.ns-anode .ns-aicon{font-size:18px;line-height:1}
.ns-anode .ns-ameta{flex:1;min-width:0}
.ns-anode .ns-aname{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ns-anode .ns-arole{font-size:11px;color:var(--ns-muted,#999)}
.ns-anode .ns-aaddr{font-size:11px;color:var(--ns-muted,#999);overflow-wrap:anywhere}
.ns-anode .ns-adot{width:9px;height:9px;border-radius:50%;background:#cbd5e1;flex:0 0 auto}
.ns-anode.active{border-color:var(--ns-primary,#2563eb);box-shadow:0 0 0 3px color-mix(in srgb,var(--ns-primary,#2563eb) 18%,transparent)}
.ns-anode.active .ns-adot{background:var(--ns-primary,#2563eb);animation:ns-pulse 1s ease-in-out infinite}
.ns-anode.done .ns-adot{background:#16a34a}
@keyframes ns-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.ns-modal{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50}
.ns-modal[hidden]{display:none}
.ns-modal-card{background:#fff;border-radius:12px;max-width:560px;width:92%;max-height:80vh;overflow:auto;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.ns-modal-card h4{margin:0 0 4px;font-size:16px}
.ns-modal-card .ns-mrole{font-size:12px;color:var(--ns-muted,#888);margin-bottom:12px}
.ns-modal-card h5{margin:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ns-muted,#888)}
.ns-modal-card pre{white-space:pre-wrap;background:#f6f7f9;border-radius:8px;padding:10px;font-size:12px;line-height:1.4;margin:0}
.ns-mact{font-size:12px;border-left:3px solid var(--ns-border,#ddd);padding:4px 8px;margin:4px 0;background:#fafafa;border-radius:4px}
.ns-modal-close{float:right;border:0;background:transparent;font-size:20px;cursor:pointer;color:#888;line-height:1}
.ns-consent{background:#fffbeb;border:1px solid #f59e0b;max-width:95%}
.ns-consent-title{font-size:14px;margin-bottom:2px}
.ns-consent-sub{font-size:12px;color:var(--ns-muted,#92704a);font-family:ui-monospace,monospace;margin-bottom:6px}
.ns-consent-req{font-size:12px;font-style:italic;color:#555;margin-bottom:8px}
.ns-consent-actions{display:flex;gap:8px}
.ns-consent-actions button{padding:6px 14px;border:0;border-radius:8px;background:var(--ns-primary,#2563eb);color:#fff;font-weight:600;cursor:pointer;font-size:13px}
.ns-consent-actions button.ghost{background:transparent;color:#b45309;border:1px solid #f59e0b}
.ns-consent-done{font-weight:700;color:#166534}
.ns-linker{background:#f0f9ff;border:1px solid #38bdf8;max-width:95%}
.ns-linker-title{font-size:14px;font-weight:700;margin-bottom:4px}
.ns-linker-sub{font-size:12px;color:var(--ns-muted,#555);margin-bottom:8px}
.ns-linker-form{display:flex;gap:8px;flex-wrap:wrap}
.ns-linker-form input{flex:1 1 280px;min-width:0;padding:7px 9px;border:1px solid var(--ns-border,#bbb);border-radius:8px;font-size:13px}
.ns-linker-form button{padding:7px 13px;border:0;border-radius:8px;background:var(--ns-primary,#2563eb);color:#fff;font-weight:600;cursor:pointer}
.ns-linker-form button.ghost{background:transparent;color:var(--ns-muted,#555);border:1px solid var(--ns-border,#bbb)}
.ns-widget{box-sizing:border-box;align-self:flex-start;max-width:95%;min-width:0;overflow-wrap:anywhere;border:1px solid var(--ns-border,#e2e2e2);border-top:3px solid var(--w,var(--ns-primary,#2563eb));border-radius:12px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:8px}
.ns-widget *{box-sizing:border-box}
.ns-widget.done{opacity:.7}
.ns-w-head{display:flex;align-items:center;gap:8px;font-size:15px}
.ns-w-icon{font-size:18px}
.ns-w-desc{font-size:13px;color:var(--ns-muted,#666)}
.ns-w-form{display:flex;flex-direction:column;gap:10px}
.ns-w-row{display:flex;flex-direction:column;gap:3px}
fieldset.ns-w-row{min-width:0;margin:0;padding:0;border:0}
.ns-w-label{font-size:13px;font-weight:600}
.ns-w-fdesc{font-size:11px;color:var(--ns-muted,#999)}
.ns-w-row input[type=text],.ns-w-row input[type=number],.ns-w-row input[type=date],.ns-w-row input[type=time],.ns-w-row select,.ns-w-row textarea{width:100%;max-width:100%;padding:7px 9px;border:1px solid var(--ns-border,#ccc);border-radius:8px;font-size:14px;font-family:inherit}
.ns-w-radio,.ns-w-multi{display:flex;flex-wrap:wrap;gap:10px;font-size:13px}
.ns-w-radio label,.ns-w-multi label,.ns-w-toggle{display:flex;align-items:center;gap:4px}
.ns-w-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.ns-w-btn{padding:8px 16px;border:0;border-radius:8px;background:var(--w,var(--ns-primary,#2563eb));color:#fff;font-weight:600;cursor:pointer;font-size:14px}
.ns-w-btn.ghost{background:transparent;color:var(--ns-muted,#666);border:1px solid var(--ns-border,#ccc)}
.ns-w-btn:disabled,.ns-w-choice:disabled{opacity:.55;cursor:default}
.ns-w-choices{display:flex;flex-direction:column;gap:8px}
.ns-w-choice{text-align:left;padding:10px 12px;border:1px solid var(--ns-border,#ddd);border-radius:10px;background:#fafbfc;cursor:pointer}
.ns-w-choice:hover:not(:disabled){border-color:var(--w,var(--ns-primary,#2563eb));background:#fff}
.ns-w-ctitle{font-weight:600;font-size:14px}
.ns-w-csub{font-size:12px;color:var(--ns-muted,#666)}
.ns-w-cmeta{font-size:12px;font-weight:600;color:var(--w,var(--ns-primary,#2563eb))}
.ns-w-fields{display:flex;flex-direction:column;gap:4px}
.ns-w-field{display:flex;justify-content:space-between;gap:12px;font-size:13px;border-bottom:1px dashed var(--ns-border,#eee);padding:3px 0}
.ns-w-fk{color:var(--ns-muted,#888)}
.ns-w-fv{font-weight:600}
.ns-devtoggle{font-size:12px;padding:4px 10px;border:1px solid var(--ns-border,#ccc);border-radius:8px;background:transparent;color:var(--ns-muted,#666);cursor:pointer}
.ns-devtoggle.on{background:#1e293b;color:#fff;border-color:#1e293b}
.ns-dev{grid-column:3;grid-row:2;display:none;flex-direction:column;gap:12px;min-height:0;min-width:0;overflow:auto}
:is(.ns-app,.ns-composed-app)[data-dev="true"] .ns-dev{display:flex}
:is(.ns-app,.ns-composed-app):not([data-dev="true"]) .ns-breadcrumb{display:none}
.ns-breadcrumb{font-size:12px;color:var(--ns-muted,#666);font-family:ui-monospace,monospace}
.ns-llmbadge{margin-left:auto;font-size:12px;font-weight:700;padding:3px 10px;border-radius:12px}
.ns-llmbadge.mock{background:#fef3c7;color:#b45309;border:1px solid #f59e0b}
.ns-llmbadge.real{background:#dcfce7;color:#166534;border:1px solid #16a34a}
.ns-llmbadge.pending{background:#e0f2fe;color:#075985;border:1px solid #38bdf8}
.ns-llmbadge.error{background:#fee2e2;color:#991b1b;border:1px solid #ef4444}
.ns-chat{display:flex;flex-direction:column;border:1px solid var(--ns-border,#e2e2e2);border-radius:10px;overflow:hidden;min-height:0}
.ns-msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.ns-msg{max-width:85%;padding:8px 12px;border-radius:var(--ns-radius,12px);white-space:pre-wrap;line-height:1.4}
.ns-msg.user{align-self:flex-end;background:var(--ns-user-bg,var(--ns-primary,#2563eb));color:var(--ns-user-fg,#fff)}
.ns-msg.bot{align-self:flex-start;background:var(--ns-msgbg,#f1f3f5)}
.ns-turn-status{display:flex;align-items:center;gap:8px;max-width:min(85%,680px);min-width:0;white-space:normal;color:var(--ns-muted,#666)}
.ns-turn-status-spinner{width:12px;height:12px;flex:0 0 12px;border:2px solid var(--ns-primary,#2563eb);border-top-color:transparent;border-radius:50%;animation:ns-spin .8s linear infinite}
.ns-turn-status-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.ns-inputbar{display:flex;flex-wrap:wrap;gap:8px;padding:10px;border-top:1px solid var(--ns-border,#e2e2e2)}
.ns-inputbar input{flex:1 1 220px;min-width:0;padding:8px 10px;border:1px solid var(--ns-border,#ccc);border-radius:8px;font-size:14px}
.ns-inputbar button{padding:8px 16px;background:var(--ns-primary,#2563eb);color:#fff;border:0;border-radius:8px;cursor:pointer;font-weight:600}
.ns-inputbar button:disabled{opacity:.5;cursor:default}
.ns-inputbar[data-turn-active="true"]{border-top-color:color-mix(in srgb,var(--ns-primary,#2563eb) 45%,var(--ns-border,#e2e2e2))}
.ns-inputbar[data-turn-active="true"] .ns-input{box-shadow:0 0 0 2px color-mix(in srgb,var(--ns-primary,#2563eb) 12%,transparent)}
.ns-send.ns-send-steering{background:var(--ns-accent,var(--ns-primary,#2563eb))}
.ns-msg.user.ns-steering-message{outline:1px solid color-mix(in srgb,currentColor 35%,transparent);outline-offset:-3px}
.ns-right{display:flex;flex-direction:column;gap:12px;min-height:0}
.ns-graph{border:1px solid var(--ns-border,#e2e2e2);border-radius:10px;padding:10px;font-size:13px}
.ns-graph h3,.ns-log h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--ns-muted,#888)}
.ns-node{display:inline-block;margin:3px;padding:4px 8px;border-radius:8px;border:1px solid var(--ns-border,#ddd);font-family:ui-monospace,monospace;font-size:12px}
.ns-node.active{background:var(--ns-primary,#2563eb);color:#fff;border-color:var(--ns-primary,#2563eb)}
.ns-node.origin{background:#fef3c7;border-color:#f59e0b}
/* hierarchical agent graph: boxes joined by elbow connectors, active box glows */
.ns-tree,.ns-tchildren{list-style:none;margin:0;padding:0}
.ns-tree li{position:relative}
.ns-tchildren{margin-left:11px;padding-left:16px;border-left:1.5px solid var(--ns-border,#dde3ea)}
.ns-tchildren>li::before{content:"";position:absolute;left:-16px;top:17px;width:13px;height:1.5px;background:var(--ns-border,#dde3ea)}
.ns-tchildren>li:last-child::after{content:"";position:absolute;left:-17.5px;top:18px;bottom:0;width:1.5px;background:var(--ns-panelbg,#fbfcfe)}
.ns-tbox{display:inline-flex;align-items:center;gap:6px;margin:3px 0;padding:5px 10px;border:1px solid var(--ns-border,#dde3ea);border-radius:10px;background:#fff;font-family:ui-monospace,monospace;font-size:12px;position:relative;transition:box-shadow .15s,border-color .15s,background .15s}
.ns-tbox .ns-ticon{font-size:13px;line-height:1}
.ns-tbox .ns-tdot{width:8px;height:8px;border-radius:50%;background:#cbd5e1;margin-left:2px}
.ns-tbox.root{font-weight:700;border-color:var(--ns-primary,#2563eb)}
.ns-tbox.leaf{color:var(--ns-muted,#7a869a);border-style:dashed;background:var(--ns-panelbg,#fafbfe)}
.ns-tbox.active{border-color:var(--ns-primary,#2563eb);background:color-mix(in srgb,var(--ns-primary,#2563eb) 10%,#fff);box-shadow:0 0 0 3px color-mix(in srgb,var(--ns-primary,#2563eb) 20%,transparent)}
.ns-tbox.active .ns-tdot{background:var(--ns-primary,#2563eb);animation:ns-pulse 1s ease-in-out infinite}
.ns-log{flex:1;border:1px solid var(--ns-border,#e2e2e2);border-radius:10px;padding:10px;overflow:auto;min-height:0}
.ns-row{font-family:ui-monospace,monospace;font-size:12px;border-left:3px solid #cbd5e1;padding:4px 8px;margin:3px 0;background:#fafafa;border-radius:4px;cursor:pointer}
.ns-row .ns-tag{font-weight:700;margin-right:6px}
.ns-row .ns-meta{color:var(--ns-muted,#888)}
.ns-row.k-run{border-left-color:#7c3aed}
.ns-row.k-agent{border-left-color:#2563eb}
.ns-row.k-model_call{border-left-color:#0891b2}
.ns-row.k-tool,
.ns-row.k-tool_call{border-left-color:#16a34a}
.ns-row.k-rest_call{border-left-color:#ca8a04}
.ns-row.k-remote_fetch{border-left-color:#db2777}
.ns-row.k-remote_call{border-left-color:#db2777;background:#fdf2f8}
.ns-row.k-mcp_call{border-left-color:#0d9488;background:#f0fdfa}
.ns-row.k-error,.ns-row.status-error{border-left-color:#dc2626;background:#fef2f2}
.ns-row pre{margin:6px 0 0;white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #eee;border-radius:4px;padding:6px;max-height:240px;overflow:auto}
.ns-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:6px}
.ns-toolbar input{font-size:12px;padding:4px 6px;border:1px solid #ccc;border-radius:6px}
.ns-pill{font-size:11px;padding:1px 6px;border-radius:10px;background:#eef;color:#446;margin-left:6px}
.ns-settings{border-top:1px solid var(--ns-border,#e2e2e2);font-size:12px}
.ns-settings summary{padding:6px 10px;cursor:pointer;color:var(--ns-muted,#666)}
.ns-settings-body{padding:6px 10px;display:flex;flex-direction:column;gap:6px}
.ns-settings-body label{display:flex;flex-direction:column;gap:2px;color:var(--ns-muted,#666)}
.ns-settings-body input[type=text],.ns-settings-body input[type=password],.ns-settings-body input:not([type]),.ns-settings-body select{padding:5px 7px;border:1px solid var(--ns-border,#ccc);border-radius:6px;font-size:12px}
.ns-settings-body .ns-row-inline{flex-direction:row;align-items:center;gap:6px}
.ns-settings-body button{padding:6px 12px;background:var(--ns-primary,#2563eb);color:#fff;border:0;border-radius:6px;cursor:pointer;align-self:flex-start}
.ns-settings-body button.ghost{background:transparent;color:var(--ns-muted,#666);border:1px solid var(--ns-border,#ccc)}
.ns-profile-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ns-key-help{padding:10px;border:1px solid color-mix(in srgb,var(--ns-primary,#2563eb) 30%,var(--ns-border,#ccc));border-radius:8px;background:color-mix(in srgb,var(--ns-primary,#2563eb) 6%,var(--ns-panelbg,#fff));display:flex;flex-direction:column;gap:6px}
.ns-key-help[hidden]{display:none}
.ns-key-help p{margin:0;line-height:1.45}
.ns-key-help>a{color:var(--ns-primary,#2563eb);font-weight:600}
.ns-key-providers{display:flex;flex-wrap:wrap;gap:6px}
.ns-key-providers a{padding:6px 9px;border:1px solid var(--ns-primary,#2563eb);border-radius:6px;color:var(--ns-primary,#2563eb);font-weight:600;text-decoration:none;background:var(--ns-panelbg,#fff)}
.ns-key-providers small{display:block;color:var(--ns-muted,#777);font-size:10px;font-weight:400;margin-top:2px}
.ns-in-use{font-size:12px;font-weight:600;color:var(--ns-fg,#333);overflow-wrap:anywhere}
.ns-start-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ns-start-actions button{align-self:center}
.ns-or{color:var(--ns-muted,#666)}
.ns-openrouter-key{display:flex;flex-direction:column;gap:2px}
.ns-openrouter-key[hidden]{display:none}
.ns-openrouter-key a{color:var(--ns-primary,#2563eb);font-weight:600}
.ns-settings-advanced{border-top:1px solid var(--ns-border,#e2e2e2);margin-top:2px}
.ns-settings-advanced>summary{padding:7px 0;color:var(--ns-muted,#666)}
.ns-settings-advanced-body{display:flex;flex-direction:column;gap:6px;padding:2px 0 4px}
.ns-hint{font-size:11px;color:var(--ns-muted,#777);margin-top:-2px}
.ns-hint.warn{color:#b45309;font-weight:600}
`;

const KIND_TAG = {
  run: "RUN",
  compile: "COMPILE",
  agent: "AGENT",
  model_call: "LLM",
  tool_call: "TOOL",
  rest_call: "REST",
  remote_fetch: "FETCH",
  remote_call: "REMOTE CALL",
  mcp_call: "MCP",
  tool_result: "RESULT",
};

export function mountApp(root, { engine, trace, manifest, connect = null }) {
  const style = document.createElement("style");
  style.textContent = BASE_CSS;
  document.head.appendChild(style);

  const theme = manifest?.theme || {};
  if (theme.primary) root.style.setProperty("--ns-primary", theme.primary);

  const net = engine.top?.network;
  const title = manifest?.networks?.[0]?.description || net?.name || "Agent network";
  const needsByok = !engine.mockLLM && (!engine.byokKey || engine.byokKey === "demo");
  // The Connect button needs an https page (or this computer's own address) in its own tab.
  const canConnect = OpenRouterConnect.isAvailable();
  const setupMessage = canConnect
    ? `To start, connect an AI provider. In ⚙ ${AI_MODEL_SETTINGS_LABEL}, select Connect with OpenRouter. Or choose a provider, create a key on its site, paste it into the API key field and select Save and start. Your key is saved in this browser.`
    : `To start, add an AI provider key. In ⚙ ${AI_MODEL_SETTINGS_LABEL}, choose a provider, create a key on its site, and paste it into the API key field. Then select Save and start. Your key is saved in this browser.`;
  const chatSlot = root.querySelector('[data-ns-slot="chat"]');
  const agentsSlot = root.querySelector('[data-ns-slot="agents"]');
  const activitySlot = root.querySelector('[data-ns-slot="activity"]');
  const composed = Boolean(chatSlot && agentsSlot);
  // Prompt v13 gives themes a dedicated settings mount. Older composed themes and
  // the fixed shell have no such slot, so their settings stay beneath the chat.
  const settingsSlot = composed ? root.querySelector('[data-ns-slot="settings"]') : null;
  let providerLinksHtml = "";
  for (const provider of providerButtons()) {
    // Where the Connect button works, it is how a visitor adds OpenRouter, so OpenRouter
    // gets no second button that opens its keys page.
    if (canConnect && provider.name === OpenRouterConnect.NAME) continue;
    providerLinksHtml += `
        <a href="${provider.keyUrl}" target="_blank" rel="noopener noreferrer" data-ns-provider="${provider.name}" data-router="${provider.router}" data-model="${provider.model}">${provider.name} <span aria-hidden="true">↗</span><small>${provider.accessNote}</small></a>`;
  }
  const settingsBodyHtml = `
    <div class="ns-settings-body">
      <div class="ns-in-use" id="ns-in-use"></div>
      <label>Saved setup <select id="ns-profile"></select></label>
      <div class="ns-key-help"${needsByok ? "" : " hidden"}>
        <strong>Don't have an API key?</strong>
        <p>An API key is a private code from an AI provider. It lets this page use that provider for you; it is not your password.</p>
        <a href="${API_KEY_HELP_URL}" target="_blank" rel="noopener noreferrer">What is an API key and how do I get one? <span aria-hidden="true">↗</span></a>
        <p>Choose a provider below and create a key. Its recommended settings will be filled in for you.</p>
        <div class="ns-key-providers">${providerLinksHtml}</div>
        <div class="ns-hint">Free tiers have usage limits and may vary by region. Other providers may require billing.</div>
      </div>
      <label><span>API key <span aria-hidden="true">*</span></span><input id="ns-key" type="password" autocomplete="off" placeholder="Paste your API key" required aria-required="true"></label>
      <div class="ns-openrouter-key" hidden>
        <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">Manage this key on OpenRouter <span aria-hidden="true">↗</span></a>
        <div class="ns-hint">See what it spends, set a spending limit, or revoke it.</div>
      </div>
      <div class="ns-start-actions">
        <button id="ns-apply">Save and start</button>
        ${canConnect ? `<span class="ns-or">or</span>
        <button id="ns-connect-openrouter" type="button">Connect with OpenRouter</button>` : ""}
      </div>
      ${canConnect ? `<div class="ns-hint">Connect with OpenRouter: sign in and approve a key for this site, with nothing to copy. It uses a free model, which has a daily limit.</div>` : ""}
      <details class="ns-settings-advanced">
        <summary>Advanced settings (optional)</summary>
        <div class="ns-settings-advanced-body">
          <label>Setup name (optional) <input id="ns-profile-name" placeholder="Local model, Google AI Studio, Groq"></label>
          <label><span id="ns-model-label">Model (optional)</span> <input id="ns-model" list="ns-model-options" placeholder="Uses this site's model"></label>
          <datalist id="ns-model-options"></datalist>
          <label>Provider URL (optional) <input id="ns-router" placeholder="Uses the configured default"></label>
          <div id="ns-router-hint" class="ns-hint"></div>
          <div class="ns-profile-actions">
            <button id="ns-save-profile" class="ghost">Save setup</button>
            <button id="ns-delete-profile" class="ghost">Delete setup</button>
          </div>
        </div>
      </details>
      <div id="ns-profile-hint" class="ns-hint">
      </div>
    </div>`;
  const settingsHtml = `
    <details class="ns-settings"${needsByok ? " open" : ""}>
      <summary>⚙ ${AI_MODEL_SETTINGS_LABEL}</summary>
      ${settingsBodyHtml}
    </details>`;

  const headerHtml = `
    <div class="ns-header">
      ${theme.logo ? `<img class="ns-logo" src="${theme.logo}" alt="logo">` : ""}
      <div class="ns-title">${escapeHtml(manifest?.brand || net?.name || "neuro-san-web")}</div>
      ${engine.mockLLM
        ? `<div class="ns-llmbadge mock" title="The default router is a deterministic mock — it ignores the model name. Add a real key + router in ⚙ settings.">⚠ MOCK LLM — no real model</div>`
        : needsByok
          ? `<div class="ns-llmbadge error" title="${escapeHtml(setupMessage)}">API key required</div>`
        : `<div class="ns-llmbadge pending" title="Configured router: ${escapeHtml(engine.top?.llm?.baseUrl || "")}. It will be verified by the first response.">LLM configured — awaiting verification</div>`}
      <div class="ns-breadcrumb" id="ns-breadcrumb">${escapeHtml(location.host)}</div>
      <button class="ns-devtoggle" id="ns-devtoggle" title="Show the technical execution trace">⚙ Developer</button>
    </div>`;
  const chatHtml = `
    <div class="ns-chat">
      <div class="ns-msgs" id="ns-msgs">
        <div class="ns-msg bot">${escapeHtml(title)}\n\n${escapeHtml(needsByok ? setupMessage : "Ask me anything to see the web of agents in action.")}</div>
      </div>
      ${settingsSlot ? "" : settingsHtml}
      <div class="ns-inputbar" data-turn-active="false">
        <input id="ns-input" class="ns-input" placeholder="Type a request…" />
        <button id="ns-send" class="ns-send">Send</button>
        <button id="ns-newchat" title="Clear conversation history" style="background:transparent;color:var(--ns-muted,#888);border:1px solid var(--ns-border,#ccc)">New chat</button>
      </div>
    </div>`;
  const agentsHtml = `
    <aside class="ns-agents">
      <h3>Agents working for you</h3>
      <div class="ns-status" id="ns-status" hidden><span class="ns-spin"></span><span id="ns-status-text">Ready when you are.</span></div>
      <div id="ns-anodes"></div>
    </aside>`;
  const devHtml = `
    <aside class="ns-dev">
      <div class="ns-graph" id="ns-graph"><h3>Agent graph &amp; origins</h3><div id="ns-nodes"></div></div>
      <div class="ns-log" id="ns-log">
        <div class="ns-toolbar">
          <h3 style="margin:0">Execution log</h3>
          <span class="ns-pill" id="ns-count">0 events</span>
          <button id="ns-export" style="margin-left:auto;font-size:11px">Export JSON</button>
        </div>
        <div id="ns-rows"></div>
      </div>
    </aside>`;
  const modalHtml = `<div class="ns-modal" id="ns-modal" hidden><div class="ns-modal-card" id="ns-modal-card"></div></div>`;

  let app;
  if (composed) {
    let headerSlot = root.querySelector('[data-ns-slot="header"]');
    if (!headerSlot) {
      headerSlot = document.createElement("div");
      headerSlot.dataset.nsSlot = "header";
      root.prepend(headerSlot);
    }
    root.classList.add("ns-composed-app");
    root.dataset.nsLayout = "composed";
    root.dataset.dev = "false";
    headerSlot.innerHTML = headerHtml;
    chatSlot.innerHTML = chatHtml;
    agentsSlot.innerHTML = agentsHtml + devHtml;
    if (settingsSlot) {
      // A theme can wrap the empty slot in native <details>/<summary> to choose
      // its own gear label and drawer placement. Otherwise the runtime supplies
      // the accessible default disclosure component inside the chosen slot.
      const disclosure = settingsSlot.closest("details");
      if (disclosure && root.contains(disclosure)) {
        disclosure.classList.add("ns-settings");
        if (needsByok) disclosure.open = true;
        settingsSlot.innerHTML = settingsBodyHtml;
      } else {
        settingsSlot.innerHTML = settingsHtml;
      }
    }
    if (activitySlot) {
      // Theme prompt v10 briefly exposed a separate activity rail. Keep those
      // themes valid, but retire the empty rail now that status lives in chat.
      activitySlot.innerHTML = "";
      activitySlot.hidden = true;
    }
    root.insertAdjacentHTML("beforeend", modalHtml);
    app = root;
  } else {
    root.removeAttribute("data-ns-layout");
    root.innerHTML = `
      <div class="ns-app" data-dev="false">
        ${headerHtml}
        <main class="ns-main">${chatHtml}</main>
        <div class="ns-split" id="ns-split" role="separator" aria-orientation="vertical" tabindex="0" title="Drag to resize the panels"></div>
        ${agentsHtml}
        ${modalHtml}
        ${devHtml}
      </div>`;
    app = root.querySelector(".ns-app");
  }

  const msgs = root.querySelector("#ns-msgs");
  const rows = root.querySelector("#ns-rows");
  const nodesEl = root.querySelector("#ns-nodes");
  const input = root.querySelector("#ns-input");
  const sendBtn = root.querySelector("#ns-send");
  const inputBar = root.querySelector(".ns-inputbar");
  const newChatBtn = root.querySelector("#ns-newchat");
  const countEl = root.querySelector("#ns-count");
  const breadcrumb = root.querySelector("#ns-breadcrumb");

  renderNodes(nodesEl, net, new Set());

  // --- trace rendering -------------------------------------------------------
  const activeOrigins = new Set();
  const activeAgents = new Set();
  let routingViolation = false;
  let count = 0;
  trace.addEventListener("event", (e) => {
    const ev = e.detail;
    count++;
    countEl.textContent = `${count} events`;

    if (ev.phase === "start") {
      if (ev.origin) activeOrigins.add(ev.origin);
      if (ev.kind === "agent" && ev.agent) activeAgents.add(ev.agent);
      addRow(rows, ev, "▶ start");
      if (ev.peerOrigin) breadcrumb.textContent = `${ev.origin} ▸ ${ev.peerOrigin}`;
    } else if (ev.phase === "end") {
      if (ev.kind === "agent" && ev.agent) activeAgents.delete(ev.agent);
      // Authoritative badge: derived from what the LLM endpoint actually returned.
      if (ev.kind === "model_call") {
        const badge = root.querySelector(".ns-llmbadge");
        if (badge) {
          if (ev.status === "error") {
            badge.className = "ns-llmbadge error";
            badge.textContent = "LLM ERROR — not verified";
            badge.title = ev.error || "The configured LLM request failed.";
          } else if (ev.mock) {
            if (!engine.mockLLM) {
              routingViolation = true;
              badge.className = "ns-llmbadge error";
              badge.textContent = "LLM ROUTING ERROR — peer used mock";
              badge.title = `A model call from ${ev.origin || "a linked network"} reached the mock router.`;
            } else {
              badge.className = "ns-llmbadge mock";
              badge.textContent = "⚠ MOCK LLM — no real model";
              badge.title = "The endpoint returned the nsDeploy mock model.";
            }
          } else if (routingViolation) {
            // Keep the violation visible; a later successful call must not hide it.
          } else if (ev.verifiedReal || ev.respModel) {
            badge.className = "ns-llmbadge real";
            badge.textContent = `● real LLM (${ev.respModel || ev.model})`;
            badge.title = `Verified response from ${ev.respModel || ev.model}.`;
          } else if (ev.phase === "end") {
            badge.className = "ns-llmbadge real";
            const requestedModel = ev.model || engine.modelOverride || "unknown";
            badge.textContent = requestedModel === "unknown"
              ? "LLM active — provider omitted model"
              : `LLM active (requested: ${requestedModel})`;
            badge.title = "The configured non-mock router returned a successful response, but the provider did not identify the actual model.";
          }
        }
      }
      updateRow(rows, ev);
    } else if (ev.phase === "update") {
      // stream chunk: append to the active bot bubble handled via onAnswerDelta
    } else if (ev.phase === "note") {
      addRow(rows, ev, "•");
    }
    renderNodes(nodesEl, net, activeAgents, activeOrigins);
    rows.parentElement.scrollTop = rows.parentElement.scrollHeight;
  });

  // --- transient turn status + generative UI (CRUSE widgets) -----------------
  let currentBot = null;
  let turnStatus = null;
  const turnStatusController = createTurnStatusController({
    show(text, event) {
      if (!turnStatus) {
        turnStatus = document.createElement("div");
        turnStatus.className = "ns-msg bot ns-turn-status";
        turnStatus.setAttribute("role", "status");
        turnStatus.setAttribute("aria-live", "polite");
        turnStatus.setAttribute("aria-atomic", "true");
        const spinner = document.createElement("span");
        spinner.className = "ns-turn-status-spinner";
        spinner.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "ns-turn-status-text";
        turnStatus.append(spinner, copy);
        msgs.appendChild(turnStatus);
      }
      turnStatus.dataset.statusType = event.type;
      turnStatus.querySelector(".ns-turn-status-text").textContent = text;
      msgs.scrollTop = msgs.scrollHeight;
    },
    hide() {
      turnStatus?.remove();
      turnStatus = null;
    },
  });
  let validateConfiguredModel = async () => true;
  // Keep the chat to one transient line while the turn is running. The final
  // cleaned answer replaces it atomically when turn.completed arrives.
  engine.onAnswerDelta = undefined;

  let activeTurnStream = null;
  engine.onActionConfirm = items => reviewActions(items);
  let actionSubmissionBusy = false;
  const idlePlaceholder = input.getAttribute("placeholder") || "Type a request…";
  function setTurnInputState(active) {
    inputBar.dataset.turnActive = String(active);
    inputBar.classList.toggle("ns-steering-active", active);
    sendBtn.classList.toggle("ns-send-steering", active);
    sendBtn.textContent = active ? "Update" : "Send";
    sendBtn.title = active ? "Add guidance to the running turn" : "Send a new request";
    input.placeholder = active ? "Add guidance while the agents work…" : idlePlaceholder;
    newChatBtn.disabled = active;
  }

  async function runUserTurn(text, interaction) {
    if (actionSubmissionBusy) return false;
    if (interaction?.executeActions) {
      if (activeTurnStream) return false;
      actionSubmissionBusy = true;
      newChatBtn.disabled = true; input.disabled = true; sendBtn.disabled = true;
      try {
        const receipts = await engine.submitActions(interaction);
        if (!receipts) return false;
        const bubble = addBubble(msgs, "bot", "");
        bubble.textContent = receipts.map(r => `${r.action}: ${r.result?.businessOutcome === "unverified" ? "response received; business outcome unverified" : r.status}\n${JSON.stringify(r.result ?? r.error ?? "", null, 2)}`).join("\n\n");
        // Receipts are already in history; the next chat turn can interpret them.
        return true;
      } catch (error) { addBubble(msgs, "bot", error.message); return false; }
      finally { actionSubmissionBusy = false; newChatBtn.disabled = false; input.disabled = false; sendBtn.disabled = false; }
    }
    text = (text || "").trim();
    if (!text || activeTurnStream) return false;
    if (!await validateConfiguredModel()) return false;
    input.value = "";
    addBubble(msgs, "user", text);
    currentBot = null;
    const stream = engine.streamTurn(text, { interaction, slyData: { backend_token: "demo-customer-token-123" } });
    activeTurnStream = stream;
    setTurnInputState(true);
    try {
      let result = null;
      for await (const event of stream) {
        if (event.visibility !== "developer" && event.type !== "agent.output.delta") turnStatusController.handle(event);
        if (event.type === "turn.completed") result = event.result;
      }
      if (!result) throw new Error("The agent turn ended without a result.");
      turnStatusController.finalAnswerStarted();
      const clean = visibleText(result.text);
      // Always show the cleaned text — never the raw answer or retained streamed text
      // (which could be an AAOSA envelope / cruse-ui JSON). Empty is fine: widgets carry the turn.
      if (!currentBot) currentBot = addBubble(msgs, "bot", clean);
      renderMarkdown(currentBot, clean);
      if (!clean) currentBot.remove();
      renderPresentation(msgs, result.presentation, runUserTurn, result.turnId);
      requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
    } catch (err) {
      turnStatusController.clear();
      addBubble(msgs, "bot", "⚠️ " + err.message);
    } finally {
      turnStatusController.clear();
      if (activeTurnStream === stream) activeTurnStream = null;
      setTurnInputState(false);
      currentBot = null;
    }
    return true;
  }
  const send = () => {
    const text = (input.value || "").trim();
    if (!text) return false;
    if (activeTurnStream) {
      if (!activeTurnStream.steer?.(text)) return false;
      input.value = "";
      const bubble = addBubble(msgs, "user", text);
      bubble.classList.add("ns-steering-message");
      bubble.dataset.inputKind = "steering";
      msgs.scrollTop = msgs.scrollHeight;
      return true;
    }
    return runUserTurn(text);
  };

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
  newChatBtn.addEventListener("click", () => {
    engine.resetHistory();
    currentBot = null;
    [...msgs.children].forEach((el) => { if (el !== msgs.firstElementChild && el.dataset.welcome !== "true") el.remove(); });
    const welcome = msgs.querySelector('[data-welcome="true"]');
    if (welcome) lockWidget(welcome, false);
  });

  // Developer mode: the technical execution trace is hidden by default. Reveal it
  // with the ⚙ Developer toggle or ?dev=1; the choice persists in this browser.
  const devToggle = root.querySelector("#ns-devtoggle");
  const store = (() => { try { return window.localStorage; } catch { return null; } })();
  let devOn = new URLSearchParams(location.search).get("dev") === "1" || store?.getItem("nsweb-dev") === "1";
  const applyDev = () => {
    app.dataset.dev = devOn ? "true" : "false";
    devToggle.classList.toggle("on", devOn);
    if (devOn) agentsSlot?.closest("details")?.setAttribute("open", "");
  };
  applyDev();
  devToggle.addEventListener("click", () => {
    devOn = !devOn;
    try { store?.setItem("nsweb-dev", devOn ? "1" : "0"); } catch {}
    applyDev();
  });

  // --- Draggable splitter between the chat and the right rail ----------------
  // Lets the user re-disperse the two panes by dragging the gutter; the rail
  // width is clamped (chat keeps a usable minimum) and persisted across reloads.
  const splitter = root.querySelector("#ns-split");
  if (splitter) {
    const RAIL_KEY = "nsweb-railw";
    const clampRail = (px) => {
      const total = app.clientWidth || 1000;     // content box (excludes padding)
      const max = Math.max(260, total - 360);     // always leave the chat ~360px
      return Math.round(Math.min(Math.max(px, 220), max));
    };
    const setRail = (px, persist) => {
      const v = clampRail(px);
      app.style.setProperty("--ns-railw", v + "px");
      if (persist) { try { store?.setItem(RAIL_KEY, String(v)); } catch {} }
      return v;
    };
    const curRail = () => parseInt(getComputedStyle(app).getPropertyValue("--ns-railw"), 10) || app.clientWidth * 0.34;
    const saved = parseInt(store?.getItem(RAIL_KEY) || "", 10);
    if (Number.isFinite(saved)) setRail(saved, false);
    let dragging = false;
    splitter.addEventListener("pointerdown", (e) => {
      dragging = true; splitter.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      try { splitter.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    splitter.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const rect = app.getBoundingClientRect();
      setRail(rect.right - e.clientX - 12, false);   // 12 = app right padding
      e.preventDefault();
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false; splitter.classList.remove("dragging");
      document.body.style.cursor = "";
      setRail(curRail(), true);
    };
    splitter.addEventListener("pointerup", endDrag);
    splitter.addEventListener("pointercancel", endDrag);
    splitter.addEventListener("keydown", (e) => {     // a11y: arrows nudge the divide
      if (e.key === "ArrowLeft") setRail(curRail() + 24, true);
      else if (e.key === "ArrowRight") setRail(curRail() - 24, true);
      else return;
      e.preventDefault();
    });
  }

  // --- "Agents working for you" map (consumer transparency) ----------------
  const splitBrand = (brand) => {
    const ch = Array.from(brand || "");
    if (ch[0] && ch[0].codePointAt(0) > 0x2000) return { icon: ch[0], label: ch.slice(1).join("").trim() };
    return { icon: "🧭", label: brand || "" };
  };
  const localHost = location.host;
  const nodeMeta = new Map(); // host -> {label, role, icon, kind, origin, address}
  const nodeStatus = new Map(); // host -> idle|active|done
  // A partner's address is its host and path, such as localhost:8081/marrow_point_harbor_tours,
  // so the visitor sees which network on that host works for them.
  const addressOf = (u) => u.host + u.pathname.replace(/\/+$/, "");
  const networkNameOf = (u) => u.pathname.split("/").filter(Boolean).pop() || u.host;
  {
    const b = splitBrand(manifest?.brand || net?.name);
    nodeMeta.set(localHost, { label: b.label || net?.name, role: "your concierge", icon: b.icon, kind: "local" });
  }
  const frontSpec = net?.getAgentSpec(net.findFrontMan());
  for (const ref of frontSpec?.tools || []) {
    const c = net.classifyTool(ref);
    try {
      if (c.kind === "remote") {
        const u = new URL(ref);
        // The same name the consent card uses: this page's link_labels, else the network's.
        const label = net.linkLabels?.[ref] || networkNameOf(u);
        if (!nodeMeta.has(u.host)) nodeMeta.set(u.host, { label: label, role: "partner network", icon: "🏢", kind: "remote", origin: u.origin, address: addressOf(u) });
      } else if (c.kind === "mcp") {
        const u = new URL(typeof ref === "string" ? ref : ref.url);
        if (!nodeMeta.has(u.host)) nodeMeta.set(u.host, { label: "Destination service", role: "hosted MCP server", icon: "🌐", kind: "mcp", origin: u.origin, address: addressOf(u) });
      }
    } catch {}
  }

  const anodesEl = root.querySelector("#ns-anodes");
  const statusEl = root.querySelector("#ns-status");
  const statusText = root.querySelector("#ns-status-text");
  const labelOf = (host) => nodeMeta.get(host)?.label || host;
  const ensureRemoteNode = (host, { brand = "", network = "", url = "" } = {}) => {
    if (!host || host === localHost) return null;
    let address = "";
    try { if (url) address = addressOf(new URL(url)); } catch {}
    let meta = nodeMeta.get(host);
    if (!meta) {
      const display = brand || network || host;
      const b = splitBrand(display);
      meta = {
        label: b.label || display,
        role: "partner network",
        icon: b.icon || "🏢",
        kind: "remote",
        origin: host.startsWith("http") ? host : `http://${host}`,
        address: address,
      };
      nodeMeta.set(host, meta);
      return meta;
    }
    if (address && !meta.address) meta.address = address;
    if (brand || network) {
      const b = splitBrand(brand || network);
      meta.label = b.label || network || meta.label;
      if (brand) meta.icon = b.icon;
    }
    return meta;
  };

  function renderANodes() {
    anodesEl.innerHTML = "";
    for (const [host, meta] of nodeMeta) {
      const st = nodeStatus.get(host) || "idle";
      const el = document.createElement("div");
      el.className = "ns-anode " + st;
      // A break after each "/" and "_" lets a long address wrap between its words.
      const address = meta.address
        ? `<div class="ns-aaddr">${escapeHtml(meta.address).replace(/[/_]/g, "$&<wbr>")}</div>`
        : "";
      el.innerHTML = `<span class="ns-aicon">${escapeHtml(meta.icon)}</span>` +
        `<div class="ns-ameta"><div class="ns-aname">${escapeHtml(meta.label)}</div><div class="ns-arole">${escapeHtml(meta.role)}</div>${address}</div>` +
        `<span class="ns-adot" title="${st}"></span>`;
      el.addEventListener("click", () => openInspector(host));
      anodesEl.appendChild(el);
    }
  }
  renderANodes();

  // NB: we deliberately do NOT fetch peer manifests here to pretty-up the labels.
  // That would contact partner origins on page load — before the user has consented
  // to anything. Partner nodes show the name and address from this page's own config
  // until the user approves a call and resolveRemote fetches the peer; the label
  // is then updated from that already-fetched metadata (see the remote_fetch "end"
  // handler below).

  const setActive = (host, busyText) => {
    for (const k of nodeStatus.keys()) if (nodeStatus.get(k) === "active") nodeStatus.set(k, "done");
    if (host && host !== localHost) ensureRemoteNode(host);
    if (host && nodeMeta.has(host)) nodeStatus.set(host, "active");
    if (busyText) { statusText.textContent = busyText; statusEl.classList.add("busy"); }
    renderANodes();
  };

  trace.addEventListener("event", (e) => {
    const ev = e.detail;
    if (ev.phase === "start") {
      switch (ev.kind) {
        case "run": for (const k of nodeStatus.keys()) nodeStatus.set(k, "idle"); setActive(localHost, "Planning your trip…"); break;
        case "remote_fetch":
          ensureRemoteNode(ev.peerOrigin, { network: ev.network, url: ev.url });
          setActive(ev.peerOrigin, `Loading ${labelOf(ev.peerOrigin)}…`);
          break;
        case "remote_call":
          ensureRemoteNode(ev.peerOrigin, { brand: ev.brand, network: ev.network });
          setActive(ev.peerOrigin, `Contacting ${labelOf(ev.peerOrigin)}…`);
          break;
        case "mcp_call": setActive(ev.peerOrigin, `Asking ${labelOf(ev.peerOrigin)}…`); break;
        case "rest_call": statusText.textContent = `Checking ${labelOf(ev.origin)} systems…`; break;
        case "tool_call": statusText.textContent = `Running ${ev.tool}…`; break;
        case "model_call": if (nodeMeta.has(ev.origin)) setActive(ev.origin, ev.origin === localHost ? "Thinking…" : undefined); break;
        default: break;
      }
    } else if (ev.phase === "end" && ev.kind === "remote_fetch") {
      // The peer was just fetched (after the user consented). Upgrade its label
      // from the now-available published brand — no pre-consent network call.
      const host = ev.peerOrigin;
      const meta = ensureRemoteNode(host, { brand: ev.brand, network: ev.network });
      if (meta) {
        if (ev.brand) {
          const b = splitBrand(ev.brand);
          meta.label = b.label || ev.network || meta.label;
          meta.icon = b.icon;
        }
        renderANodes();
      }
    } else if (ev.phase === "end" && ev.kind === "run") {
      for (const k of nodeStatus.keys()) if (nodeStatus.get(k) === "active") nodeStatus.set(k, "done");
      statusEl.classList.remove("busy");
      statusText.textContent = "Done — see your answer on the left.";
      renderANodes();
    }
  });

  // A dangling agent reference becomes a tool-call-time linker. The entered URL
  // is validated against the peer's published manifest by Engine before storage.
  engine.onLinkRequired = (info) => new Promise((resolve) => {
    statusEl.classList.remove("busy");
    statusText.textContent = `Waiting for the ${info.reference} network URL…`;
    const el = document.createElement("div");
    el.className = "ns-msg bot ns-linker";
    el.innerHTML =
      `<div class="ns-linker-title">Link ${escapeHtml(info.reference)}</div>` +
      `<div class="ns-linker-sub">Enter the root URL of the nsDeploy site that provides this network.</div>` +
      `<form class="ns-linker-form"><input type="url" required placeholder="https://airline.example.com" aria-label="Target nsDeploy site URL">` +
      `<button type="submit">Link</button><button type="button" class="ghost">Cancel</button></form>`;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    const form = el.querySelector("form");
    const input = el.querySelector("input");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const target = input.value.trim();
      let host = "";
      try { host = new URL(target).host; } catch {}
      if (!host) { input.setCustomValidity("Enter a complete http:// or https:// URL."); input.reportValidity(); return; }
      input.setCustomValidity("");
      if (!nodeMeta.has(host)) {
        nodeMeta.set(host, { label: host, role: "linked partner network", icon: "🏢", kind: "remote", origin: new URL(target).origin });
        renderANodes();
      }
      form.innerHTML = `<div class="ns-consent-done">Linked to ${escapeHtml(host)}. Validating…</div>`;
      statusEl.classList.add("busy");
      statusText.textContent = `Validating ${host}…`;
      resolve(target);
    }, { once: true });
    el.querySelector("button.ghost").addEventListener("click", () => {
      form.innerHTML = `<div class="ns-consent-done">Linking cancelled.</div>`;
      statusText.textContent = "Continuing without that network…";
      resolve(null);
    }, { once: true });
    input.focus();
  });

  // --- cross-network consent (approve calls to other hosted networks) ------
  // Each partner's name by host, from its consent card, for the window prompt below.
  const peerLabels = new Map();
  engine.onConsent = (info) => new Promise((resolve) => {
    peerLabels.set(info.peerOrigin, info.peerLabel);
    statusEl.classList.remove("busy");
    statusText.textContent = `Waiting for your OK to contact ${info.peerLabel}…`;
    const tokens = info.est?.totalTokens ? `~${Number(info.est.totalTokens).toLocaleString()} tokens` : "";
    const cost = info.est?.costText ? ` (~${info.est.costText})` : "";
    const el = document.createElement("div");
    el.className = "ns-msg bot ns-consent";
    el.innerHTML =
      `<div class="ns-consent-title">🔗 Contact <b>${escapeHtml(info.peerLabel)}</b> on your behalf?</div>` +
      `<div class="ns-consent-sub">${escapeHtml(info.peerOrigin)}${tokens ? " · est. " + escapeHtml(tokens) + escapeHtml(cost) : ""}</div>` +
      (info.requestText ? `<div class="ns-consent-req">“${escapeHtml(info.requestText.slice(0, 140))}”</div>` : "") +
      `<div class="ns-consent-actions">` +
        `<button data-d="allow">Allow</button>` +
        `<button data-d="always">Always allow</button>` +
        `<button data-d="decline" class="ghost">Decline</button>` +
      `</div>`;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    el.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        const d = b.dataset.d;
        el.querySelector(".ns-consent-actions").outerHTML =
          `<div class="ns-consent-done">${d === "decline" ? "✕ Declined" : "✓ Allowed"}</div>`;
        statusEl.classList.add("busy");
        statusText.textContent = d === "decline" ? "Skipping that partner…" : `Contacting ${info.peerLabel}…`;
        resolve(d);
      }, { once: true }),
    );
  });

  // --- partner action window (a partner's write opens its own site's window) ----
  // Asked in the chat, with the partner's name, in place of the transport's generic
  // dialog. The window opens in the visitor's click, so the browser does not block it.
  setActionWindowPrompt(({ url, origin, brand, signal }) => new Promise((resolve, reject) => {
    const host = new URL(origin).host;
    const label = peerLabels.get(host) || brand || host;
    statusEl.classList.remove("busy");
    statusText.textContent = `Waiting for you to open ${label}…`;
    const el = document.createElement("div");
    el.className = "ns-msg bot ns-consent ns-action-window";
    el.innerHTML =
      `<div class="ns-consent-title"><b>${escapeHtml(label)}</b> will open its own window, so you can check and finish this there.</div>` +
      `<div class="ns-consent-sub">Opens on ${escapeHtml(host)}</div>` +
      `<div class="ns-consent-actions">` +
        `<button data-d="open">Open ${escapeHtml(label)}</button>` +
        `<button data-d="cancel" class="ghost">Cancel</button>` +
      `</div>`;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    const finish = (text) => {
      const done = document.createElement("div");
      done.className = "ns-consent-done";
      done.textContent = text;
      el.querySelector(".ns-consent-actions")?.replaceWith(done);
    };
    const stop = () => {
      finish("✕ Cancelled");
      statusEl.classList.add("busy");
      reject(new Error("Action window cancelled; action not started."));
    };
    signal?.addEventListener("abort", stop, { once: true });
    el.querySelector('[data-d="open"]').addEventListener("click", () => {
      const popup = window.open(url, "_blank", "popup,width=700,height=650");
      if (!popup) {
        el.querySelector(".ns-consent-sub").textContent = "Your browser blocked the window. Allow pop-ups for this page, then click again.";
        return;
      }
      signal?.removeEventListener("abort", stop);
      finish(`✓ Opened ${label}`);
      statusEl.classList.add("busy");
      statusText.textContent = `Waiting for ${label}…`;
      resolve(popup);
    });
    el.querySelector('[data-d="cancel"]').addEventListener("click", () => {
      signal?.removeEventListener("abort", stop);
      stop();
    }, { once: true });
  }));

  // --- node inspector (instructions + what the agent did) ------------------
  const modal = root.querySelector("#ns-modal");
  const modalCard = root.querySelector("#ns-modal-card");
  const closeModal = () => { modal.hidden = true; };
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  function friendlyActivity(ev) {
    switch (ev.kind) {
      case "remote_call": return ev.phase === "start"
        ? `→ Asked: “${(ev.requestPayload?.user_message?.text || "").slice(0, 120)}”`
        : `← Replied: ${(ev.responsePreview || "").slice(0, 140)}`;
      case "mcp_call": return ev.phase === "end" ? `MCP ${ev.method}` : null;
      case "tool_call": return ev.phase === "end" ? `Ran tool: ${ev.tool}` : null;
      case "rest_call": return ev.phase === "end" ? `Backend call: ${ev.url}` : null;
      case "model_call": return ev.phase === "end" ? `LLM call (${ev.model || "?"})${ev.mock ? " [mock]" : ""}` : null;
      case "agent": return ev.phase === "start" ? `Agent “${ev.agent}” started` : null;
      default: return null;
    }
  }

  function openInspector(host) {
    const meta = nodeMeta.get(host);
    if (!meta) return;
    let instructions = "";
    if (meta.kind === "local") {
      instructions = net.getAgentSpec(net.findFrontMan())?.instructions?.trim() || "";
    } else {
      const sess = [...(engine.registry?.cache?.values() || [])].find((s) => { try { return new URL(s.base).host === host; } catch { return false; } });
      if (sess) instructions = sess.network.getAgentSpec(sess.network.findFrontMan())?.instructions?.trim() || "";
    }
    const acts = trace.events.filter((ev) => ev.phase !== "update" && (ev.origin === host || ev.peerOrigin === host)).map(friendlyActivity).filter(Boolean);
    modalCard.innerHTML =
      `<button class="ns-modal-close" title="Close">×</button>` +
      `<h4>${escapeHtml(meta.icon)} ${escapeHtml(meta.label)}</h4>` +
      `<div class="ns-mrole">${escapeHtml(meta.role)} · ${escapeHtml(meta.address || host)}</div>` +
      `<h5>Instructions</h5>` +
      (instructions ? `<pre>${escapeHtml(instructions)}</pre>` : `<div class="ns-mrole">Loaded when first contacted.</div>`) +
      `<h5>What it did this session</h5>` +
      (acts.length ? acts.map((a) => `<div class="ns-mact">${escapeHtml(a)}</div>`).join("") : `<div class="ns-mrole">Nothing yet.</div>`);
    modalCard.querySelector(".ns-modal-close").addEventListener("click", closeModal);
    modal.hidden = false;
  }

  // AI model settings. Router, model and key are never read from or written
  // to the URL. Apply keeps them for this tab in session storage, and saved
  // profiles make them reusable across agent networks.
  let profileStore = loadByokStore();
  let selectedProfile = getSelectedByokProfile(profileStore);
  const profileEl = root.querySelector("#ns-profile");
  const profileNameEl = root.querySelector("#ns-profile-name");
  const routerEl = root.querySelector("#ns-router");
  const keyEl = root.querySelector("#ns-key");
  const modelEl = root.querySelector("#ns-model");
  const modelOptionsEl = root.querySelector("#ns-model-options");
  const hintEl = root.querySelector("#ns-router-hint");
  const profileHintEl = root.querySelector("#ns-profile-hint");
  const saveProfileBtn = root.querySelector("#ns-save-profile");
  const deleteProfileBtn = root.querySelector("#ns-delete-profile");
  const providerLinks = root.querySelectorAll("[data-ns-provider]");
  // The help is for visitors without a key, so it hides while the key field has one.
  const keyHelpEl = root.querySelector(".ns-key-help");
  // An OpenRouter key, connected or pasted, gets a link to its settings page on OpenRouter.
  const openRouterKeyEl = root.querySelector(".ns-openrouter-key");
  const refreshKeyHelp = () => {
    if (keyHelpEl) keyHelpEl.hidden = keyEl.value.trim().length > 0;
    OpenRouterConnect.refreshKeyLink(keyEl, openRouterKeyEl);
  };
  // The compiled LLM may already point at BYOK after a saved-profile upgrade.
  // New manifests identify an opt-in mock separately; retain compatibility with
  // older manifests where the mock was the declared default base URL.
  const mockUrl = manifest?.llm_router?.mock_router
    || (manifest?.llm_router?.mock ? manifest?.llm_router?.base_url : "");
  const byokRouter = engine.byokRouter || "";
  const staticMode = manifest?.deployment?.mode === "static";
  // Name the provider, model and key the chat uses now (in-use-line.js). The router is the
  // one the chat calls, after the setup and any upgrade from the mock router.
  const activeRouter = engine.top?.llm?.baseUrl || "";
  const inUseEl = root.querySelector("#ns-in-use");
  inUseEl.textContent = InUseLine.text({
    mock: engine.mockLLM,
    key: engine.byokKey,
    router: activeRouter,
    model: engine.modelOverride,
    siteModel: effectiveModel("", frontSpec?.llm_config?.model_name, net?.config?.llm_config?.model_name),
    providers: API_KEY_PROVIDERS,
    viaThisSite: !staticMode && !!byokRouter && resolveByokRouter(activeRouter) === resolveByokRouter(byokRouter),
  });
  inUseEl.title = activeRouter;
  // Without a visitor-chosen model, each agent sends its declared model, then the
  // network's, or else the mock placeholder. Check the same model the runner sends.
  let everyAgentHasModel = true;
  // The front man and "agent" tools call a model; coded and toolbox tools do not.
  for (const spec of net?.config?.tools || []) {
    const callsModel = spec === frontSpec || net.classifyTool(spec?.name).kind === "agent";
    const sent = effectiveModel("", spec?.llm_config?.model_name, net?.config?.llm_config?.model_name);
    if (callsModel && isPlaceholderModel(sent)) everyAgentHasModel = false;
  }
  // The Model field is optional only when every agent already has a model. Otherwise it
  // is marked required, like the API key.
  if (!everyAgentHasModel) {
    root.querySelector("#ns-model-label").innerHTML = 'Model <span aria-hidden="true">*</span>';
    modelEl.placeholder = "Enter a model your provider supports";
    modelEl.required = true;
    modelEl.setAttribute("aria-required", "true");
  }

  routerEl.value = engine.routerOverride || engine.top?.llm?.baseUrl || byokRouter || mockUrl;
  modelEl.value = engine.modelOverride || "";
  // The key shown comes from the same source as the router and model the engine
  // uses, so it never shows another setup's key next to this tab's router.
  keyEl.value = loadTabByokSetup(selectedProfile).key;
  // The provider whose settings the form holds. Another key from the same provider
  // does not fill in that provider's defaults again.
  let formProvider = providerForApiKey(keyEl.value);
  OpenRouterConnect.refreshKeyLink(keyEl, openRouterKeyEl);
  profileNameEl.value = selectedProfile?.name || "";

  const profileStorageText = canUseByokCookie()
    ? "Saved setups are kept in this browser and mirrored to a local cookie, so they follow nsDeploy across localhost ports."
    : "Saved setups are kept in this browser for this site.";

  const profileLabel = (p) => `${p.name || guessByokProfileName(p)}${p.model ? ` (${p.model})` : ""}`;
  const refreshProfileOptions = (selectedId = profileStore.selectedId) => {
    profileEl.innerHTML = `<option value="">Custom / unsaved</option>` +
      profileStore.profiles.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(profileLabel(p))}</option>`).join("");
    profileEl.value = profileStore.profiles.some((p) => p.id === selectedId) ? selectedId : "";
    deleteProfileBtn.disabled = !profileEl.value;
  };
  const setProfileHint = (text = profileStorageText, cls = "") => {
    profileHintEl.className = cls ? `ns-hint ${cls}` : "ns-hint";
    profileHintEl.textContent = text;
  };
  const applyProfileToForm = (profile) => {
    if (!profile) return;
    profileNameEl.value = profile.name || "";
    keyEl.value = profile.key || "";
    formProvider = providerForApiKey(keyEl.value);
    refreshKeyHelp();
    modelEl.value = profile.model || "";
    routerEl.value = resolveByokRouter(profile.router || "");
    refreshHint();
  };
  const currentProfileDraft = (id) => {
    let router = routerEl.value.trim();
    const key = keyEl.value.trim();
    const model = normalizeModelName(modelEl.value);
    if ((key || model) && byokRouter && isMockRouter(router)) {
      router = byokRouter;
      routerEl.value = router;
    }
    return {
      id: id || "",
      name: profileNameEl.value.trim() || guessByokProfileName({ router, model }),
      key,
      model,
      router: portableByokRouter(router),
      runner: false,
    };
  };
  const saveCurrentProfile = () => {
    const draft = currentProfileDraft(profileEl.value);
    if (!draft.key) {
      setProfileHint("API key is required. Paste your key above to continue.", "warn");
      keyEl.focus();
      return null;
    }
    const res = upsertByokProfile(draft, { select: true });
    if (!res.profile) return null;
    profileStore = res.store;
    selectedProfile = res.profile;
    profileNameEl.value = res.profile.name;
    refreshProfileOptions(res.profile.id);
    setProfileHint(`Saved setup "${res.profile.name}".`);
    return res.profile;
  };
  refreshProfileOptions(selectedProfile?.id || "");
  setProfileHint();

  const normalizedRouter = (url) => {
    try {
      const parsed = new URL(url, location.origin);
      const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
      const host = loopback ? "loopback" : parsed.hostname.toLowerCase();
      return `${parsed.protocol}//${host}:${parsed.port}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`;
    }
    catch { return String(url || "").replace(/\/$/, ""); }
  };
  const isMockRouter = (url) => Boolean(
    url && ((mockUrl && normalizedRouter(url) === normalizedRouter(mockUrl)) || /:8003(\/|$)/.test(url)),
  );
  const refreshHint = () => {
    const hasKey = keyEl.value.trim().length > 0;
    if (hasKey && isMockRouter(routerEl.value.trim())) {
      hintEl.className = "ns-hint warn";
      hintEl.textContent = `⚠ This router is the MOCK (ignores your key). It will be switched to the real proxy ${byokRouter || ""} when you save.`;
    } else if (isMockRouter(routerEl.value.trim())) {
      hintEl.className = "ns-hint";
      hintEl.textContent = `Mock router (no key needed). To use a real LLM, enter a key — it will route via ${byokRouter || "the proxy"}.`;
    } else {
      hintEl.className = "ns-hint";
      const viaThisSite = !staticMode && !!byokRouter
        && resolveByokRouter(routerEl.value) === resolveByokRouter(byokRouter);
      hintEl.textContent = viaThisSite
        ? "This site passes your key on to your AI provider."
        : "Your browser sends your key directly to the Provider URL above.";
    }
  };
  const applyProviderDefaults = (provider, message) => {
    formProvider = provider;
    routerEl.value = provider.router;
    modelEl.value = provider.model;
    profileNameEl.value = provider.name;
    profileEl.value = "";
    if (message) setProfileHint(message);
    refreshHint();
  };
  const fetchAvailableModels = async (router, key) => {
    if (!router || isMockRouter(router)) return null;
    try {
      const response = await fetch(`${router.replace(/\/$/, "")}/models`, {
        cache: "no-store",
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      });
      if (!response.ok) return null;
      const body = await response.json();
      const models = (Array.isArray(body?.data) ? body.data : [])
        .map((item) => normalizeModelName(item?.id))
        .filter(Boolean);
      modelOptionsEl.innerHTML = "";
      for (const id of models) {
        const option = document.createElement("option");
        option.value = id;
        modelOptionsEl.appendChild(option);
      }
      return models;
    } catch {
      // Not every OpenAI-compatible provider publishes a model catalog.
      return null;
    }
  };
  // True when a turn would send a real router an empty model or the mock
  // placeholder, which the runtime refuses. A chosen model is what every agent
  // sends; without one, each agent's own model counts.
  const lacksModel = (requireActiveKey, router, key, model) => {
    // A send uses the applied setup.
    if (requireActiveKey) {
      if (engine.mockLLM) return false;
      if (engine.modelOverride) return isPlaceholderModel(engine.modelOverride);
      return !everyAgentHasModel;
    }
    // Apply checks the form it is about to save.
    if (!key || key === "demo") return false;
    // With a real key, Apply switches a mock router to the BYOK router.
    const nextRouter = byokRouter && isMockRouter(router) ? byokRouter : router;
    if (isMockRouter(nextRouter)) return false;
    if (model) return isPlaceholderModel(model);
    return !everyAgentHasModel;
  };
  // The Model field is inside the collapsed advanced settings, so open them before focusing it.
  const focusModelField = () => {
    root.querySelector(".ns-settings-advanced").open = true;
    modelEl.focus();
  };
  // Ask for a model. Mention the Model field's suggestions only when an earlier
  // /models lookup filled them; this adds no request of its own.
  const modelSetupMessage = () => {
    const choice = modelOptionsEl.options.length
      ? "Pick a suggested model in the Model field, or enter another model your provider supports"
      : "Enter a model your provider supports in the Model field";
    return `This site needs a model name before it can answer with your key. ${choice}, then select Save and start.`;
  };
  validateConfiguredModel = async (requireActiveKey = true) => {
    let router = routerEl.value.trim();
    const key = keyEl.value.trim();
    const model = normalizeModelName(modelEl.value);
    modelEl.value = model;
    if (requireActiveKey && !engine.mockLLM && (!engine.byokKey || engine.byokKey === "demo")) {
      const message = key
        ? "Your API key is ready. Select Save and start before sending a request."
        : setupMessage;
      setProfileHint(message, "warn");
      root.querySelector(".ns-settings").open = true;
      (key ? root.querySelector("#ns-apply") : keyEl).focus();
      addBubble(msgs, "bot", `⚠️ ${message}`);
      return false;
    }
    if (lacksModel(requireActiveKey, router, key, model)) {
      // A usable model typed but not applied yet only needs Apply.
      const unapplied = requireActiveKey && !!model && !isPlaceholderModel(model);
      const message = unapplied
        ? "Your model is ready. Select Save and start before sending a request."
        : modelSetupMessage();
      setProfileHint(message, "warn");
      root.querySelector(".ns-settings").open = true;
      if (unapplied) root.querySelector("#ns-apply").focus();
      else focusModelField();
      addBubble(msgs, "bot", `⚠️ ${message}`);
      return false;
    }
    if (!model) return true;
    if ((key || model) && byokRouter && isMockRouter(router)) {
      router = byokRouter;
      routerEl.value = router;
      refreshHint();
    }
    const availableModels = await fetchAvailableModels(router, key);
    if (!availableModels?.length || availableModels.includes(model)) return true;

    const shown = availableModels.slice(0, 6);
    const remainder = availableModels.length - shown.length;
    setProfileHint(
      `Model "${model}" is not published by this upstream. Available: ${shown.join(", ")}${remainder > 0 ? `, and ${remainder} more` : ""}.`,
      "warn",
    );
    root.querySelector(".ns-settings").open = true;
    focusModelField();
    return false;
  };
  // Put back the site's own settings in place of those a provider's key filled in,
  // leaving any field the visitor has changed.
  const clearProviderDefaults = (provider) => {
    if (routerEl.value.trim() === provider.router) routerEl.value = byokRouter || mockUrl;
    if (modelEl.value.trim() === provider.model) modelEl.value = "";
    if (profileNameEl.value.trim() === provider.name) profileNameEl.value = "";
    formProvider = null;
  };
  // The page cannot tell which provider an unrecognized key is for, so the visitor checks
  // the Provider URL, and enters a model when the site needs one.
  const unrecognizedKeyMessage = () => {
    const needsModel = !everyAgentHasModel && !modelEl.value.trim();
    return "The page can't tell which provider this key is for. Check the Provider URL, "
      + (needsModel ? "enter a model your provider supports in the Model field, " : "")
      + "then select Save and start.";
  };
  // A key from a newly detected provider fills in that provider's settings, so editing
  // the key keeps a model or router the visitor chose. Any other key entered against
  // the mock router switches it to the real proxy.
  keyEl.addEventListener("input", () => {
    const key = keyEl.value.trim();
    const provider = providerForApiKey(key);
    if (provider && provider !== formProvider) {
      applyProviderDefaults(provider, `${provider.name} key detected. Recommended settings are ready.`);
    } else if (!provider && key) {
      // Another provider's settings must not stay with this key, and a real key never goes
      // to the mock. Then show the Provider URL and Model fields and ask for a check.
      if (formProvider) clearProviderDefaults(formProvider);
      if (byokRouter && isMockRouter(routerEl.value.trim())) routerEl.value = byokRouter;
      root.querySelector(".ns-settings-advanced").open = true;
      setProfileHint(unrecognizedKeyMessage());
    } else if (!key && needsByok) {
      setProfileHint(setupMessage, "warn");
    }
    if (profileEl.value && selectedProfile?.key !== keyEl.value.trim()) profileEl.value = "";
    refreshKeyHelp();
    refreshHint();
  });
  routerEl.addEventListener("input", refreshHint);
  modelEl.addEventListener("input", () => {
    const normalized = normalizeModelName(modelEl.value);
    if (normalized !== modelEl.value.trim() && normalized) modelEl.value = normalized;
    if (modelEl.value.trim() && byokRouter && isMockRouter(routerEl.value.trim())) routerEl.value = byokRouter;
    if (!profileNameEl.value.trim()) profileNameEl.value = guessByokProfileName({ router: routerEl.value, model: modelEl.value });
    refreshHint();
  });
  providerLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const provider = API_KEY_PROVIDERS.find((candidate) => candidate.name === link.dataset.nsProvider);
      if (!provider) return;
      // A key recognized as another provider's must not be sent to this provider.
      const keyProvider = providerForApiKey(keyEl.value.trim());
      if (keyProvider && keyProvider !== provider) keyEl.value = "";
      refreshKeyHelp();
      applyProviderDefaults(provider, `${provider.name} selected. Create a key in the new tab, then paste it here.`);
    });
  });
  // Connect with OpenRouter leaves this page. When OpenRouter sends the visitor back,
  // boot() finishes the sign-in before this panel is built (openrouter-connect.js).
  const keyLabel = OpenRouterConnect.keyLabel(manifest?.brand || net?.name || "");
  root.querySelector("#ns-connect-openrouter")?.addEventListener(
    "click",
    OpenRouterConnect.connect.bind(OpenRouterConnect, keyLabel, setProfileHint),
  );
  profileEl.addEventListener("change", () => {
    const id = profileEl.value;
    profileStore = selectByokProfile(id);
    selectedProfile = getSelectedByokProfile(profileStore);
    if (selectedProfile) {
      applyProfileToForm(selectedProfile);
      setProfileHint(`Loaded setup "${selectedProfile.name}". Select Save and start to use it for this page.`);
    } else {
      profileNameEl.value = "";
      setProfileHint();
    }
    refreshProfileOptions(id);
    refreshHint();
  });
  saveProfileBtn.addEventListener("click", () => {
    saveCurrentProfile();
  });
  deleteProfileBtn.addEventListener("click", () => {
    const id = profileEl.value;
    if (!id) return;
    const oldName = profileStore.profiles.find((p) => p.id === id)?.name || "setup";
    profileStore = deleteByokProfile(id);
    selectedProfile = getSelectedByokProfile(profileStore);
    refreshProfileOptions(profileStore.selectedId);
    setProfileHint(`Deleted setup "${oldName}".`);
  });
  refreshHint();
  if (needsByok) setProfileHint(setupMessage, "warn");
  // Report the OpenRouter sign-in that boot() finished before this panel existed.
  if (connect) {
    const connected = connect.status === "connected";
    setProfileHint(connect.message, connected ? "" : "warn");
    addBubble(msgs, "bot", connected ? connect.message : `⚠️ ${connect.message}`);
    if (!connected) root.querySelector(".ns-settings").open = true;
  }

  root.querySelector("#ns-apply").addEventListener("click", async () => {
    const p = new URLSearchParams(location.search);
    p.delete("key"); // the key must never appear in the URL
    const key = keyEl.value.trim();
    const model = normalizeModelName(modelEl.value);
    modelEl.value = model;
    if (!key) {
      setProfileHint("API key is required. Paste your key above to continue.", "warn");
      root.querySelector(".ns-settings").open = true;
      keyEl.focus();
      return;
    }
    if (!await validateConfiguredModel(false)) return;
    const saved = saveCurrentProfile();
    // Key, router and model stay with this tab in session storage, never in the
    // query string. Boot reads them after the reload, so a setup that another tab
    // or port selects later cannot pair this tab's key with a different router.
    saveTabByokSetup(saved);
    const qs = p.toString();
    // Rewrite the (key-free) query string, then reload so the applied setup takes effect.
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch {}
    if (saved) setProfileHint(`Saved setup "${saved.name}". Reloading...`);
    location.reload();
  });
  root.querySelector("#ns-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(trace.export(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "agent-trace.json";
    a.click();
  });

  // Optional landing form: if this site's manifest declares a `welcome` widget,
  // render it on load (with an intro line) so the site doesn't open as a bare
  // chatbot. Submitting it passes the composed input to the agent; the user can
  // also just type a query instead. Authored by the site, collects customer info.
  if (manifest?.welcome?.widget) {
    const greet = msgs.querySelector(".ns-msg.bot");
    if (manifest.welcome.message && greet) greet.textContent = manifest.welcome.message;
    const welcome = renderWidget(msgs, { ...manifest.welcome.widget, id: "welcome" }, runUserTurn, "welcome");
    welcome.dataset.welcome = "true";
  }
}

function addBubble(msgs, cls, text) {
  const el = document.createElement("div");
  el.className = `ns-msg ${cls}`;
  el.textContent = text;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

// --- CRUSE generative-UI: parse a fenced ```cruse-ui {json}``` block ---------
function visibleText(s) {
  if (!s) return "";
  let out = s.replace(/```cruse-ui[\s\S]*?```/gi, "").trim();
  const i = out.search(/```cruse-ui/i);
  if (i >= 0) out = out.slice(0, i).trim();
  return unwrapAaosa(out);
}

// neuro-san agents speak the AAOSA wire format: a JSON envelope with a "Mode" plus
// Name/Inquiry (and Response/Requirements/…), sometimes wrapped in <tool_response>
// tags. Only the human-facing parts are meant for the user; the rest is inter-agent
// protocol the framework normally unwraps. Surface that and drop the envelope/tags so
// they never leak into the chat. Applied only at display time — inter-agent results
// keep their structure.
function unwrapAaosa(s) {
  if (!s) return s;
  const t = s.replace(/<\/?tool_(?:response|call)>/gi, "").trim();
  // Only act on an AAOSA envelope: a JSON object with a "Mode" plus "Name"/"Inquiry".
  if (!/"Mode"\s*:/.test(t) || !t.includes("{")) return t;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (end <= start) return t;
  const obj = tolerantParse(t.slice(start, end + 1));
  if (!obj || obj.Mode === undefined || (obj.Name === undefined && obj.Inquiry === undefined)) return t;
  // Fulfill / clarify mode: the human-facing answer.
  if (typeof obj.Response === "string" && obj.Response.trim()) return obj.Response.trim();
  // Determine mode: a request for info — surface the requirement prompts as a question.
  if (Array.isArray(obj.Requirements)) {
    const qs = obj.Requirements.map((r) => r && (r.description || r.title)).filter(Boolean);
    if (qs.length) return qs.join("\n");
  }
  return "";  // pure protocol with nothing user-facing → show nothing (never the raw JSON)
}

function tolerantParse(s) {
  try { return JSON.parse(s); } catch {}
  try { return JSON.parse(s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, "$1")); } catch {}
  return null;
}
function lockWidget(card, locked = true) {
  card.querySelectorAll("button,input,select,textarea").forEach((el) => (el.disabled = locked));
  card.classList.toggle("done", locked);
}

// Render one schema property. Widgets are generated by LLMs / partner agents, so
// every interpolated value is untrusted. We never put the schema KEY (or any other
// untrusted string) into an HTML attribute or a CSS selector: each field gets a
// runtime-assigned, selector-safe id (`f0`, `f1`, …). Titles/enums are HTML-escaped;
// numeric bounds are coerced to real numbers. This closes the widget XSS surface.
function renderField(fid, key, f, req) {
  const ui = f["x-ui"] || {};
  const radio = Array.isArray(f.enum) && f.enum.length && ui.widget === "radio";
  const labelTag = radio ? "legend" : "label";
  const label = `<${labelTag} class="ns-w-label">${escapeHtml(f.title || key)}${req ? " *" : ""}</${labelTag}>`;
  const desc = f.description ? `<div class="ns-w-fdesc">${escapeHtml(f.description)}</div>` : "";
  const enumVals = Array.isArray(f.enum) ? f.enum.map((v) => escapeHtml(v)) : [];
  const enumLabels = enumVals.map((value, i) => Array.isArray(ui.enumLabels) && typeof ui.enumLabels[i] === "string" ? escapeHtml(ui.enumLabels[i]) : value);
  const itemVals = Array.isArray(f.items?.enum) ? f.items.enum.map((v) => escapeHtml(v)) : [];
  const min = Number(f.minimum);
  const max = Number(f.maximum);
  let ctl;
  if (enumVals.length && ui.widget === "radio") {
    ctl = `<div class="ns-w-radio">` + enumVals.map((v, i) => `<label><input type="radio" name="${fid}" value="${v}"><span>${enumLabels[i]}</span></label>`).join("") + `</div>`;
  } else if (enumVals.length) {
    ctl = `<select data-field="${fid}"><option value="">—</option>` + enumVals.map((v, i) => `<option value="${v}">${enumLabels[i]}</option>`).join("") + `</select>`;
  } else if (f.type === "boolean") {
    ctl = `<label class="ns-w-toggle"><input type="checkbox" data-field="${fid}"> Yes</label>`;
  } else if (f.type === "array" && itemVals.length) {
    ctl = `<div class="ns-w-multi" data-field="${fid}">` + itemVals.map((v) => `<label><input type="checkbox" value="${v}"> ${v}</label>`).join("") + `</div>`;
  } else if (f.type === "number" || f.type === "integer") {
    ctl = `<input type="number" data-field="${fid}"${Number.isFinite(min) ? ` min="${min}"` : ""}${Number.isFinite(max) ? ` max="${max}"` : ""}>`;
  } else if (f.format === "date") {
    ctl = `<input type="date" data-field="${fid}">`;
  } else if (f.format === "time") {
    ctl = `<input type="time" data-field="${fid}" step="60">`;
  } else if (ui.widget === "textarea") {
    ctl = `<textarea data-field="${fid}" rows="3"></textarea>`;
  } else {
    ctl = `<input type="text" data-field="${fid}">`;
  }
  const rowTag = radio ? "fieldset" : "div";
  return `<${rowTag} class="ns-w-row">${label}${desc}${ctl}</${rowTag}>`;
}

// `entries` is the same Object.entries(props) array used to render, so index i
// maps to the field id `f${i}` (selector-safe; the untrusted key is never queried).
function collectForm(card, entries) {
  const vals = Object.create(null);
  entries.forEach(([key, f], i) => {
    const fid = "f" + i;
    if (Array.isArray(f.enum) && f["x-ui"]?.widget === "radio") {
      const sel = card.querySelector(`input[name="${fid}"]:checked`);
      vals[key] = sel ? sel.value : "";
    } else if (f.type === "array" && f.items?.enum) {
      const box = card.querySelector(`[data-field="${fid}"]`);
      vals[key] = box ? [...box.querySelectorAll("input:checked")].map((i2) => i2.value) : [];
    } else if (f.type === "boolean") {
      const el = card.querySelector(`[data-field="${fid}"]`);
      vals[key] = !!el?.checked;
    } else {
      const el = card.querySelector(`[data-field="${fid}"]`);
      vals[key] = el ? el.value : "";
      if (["number", "integer"].includes(f.type) && vals[key] !== "") vals[key] = Number(vals[key]);
    }
  });
  return vals;
}

// Only called with the root's consolidated proposal (or the welcome widget).
export function renderPresentation(container, presentation, onSubmit, turnId) {
  const normalized = normalizePresentation(presentation);
  if (!normalized.presentation) return null;
  const surface = document.createElement("section");
  surface.className = "ns-presentation";
  surface.setAttribute("aria-label", "Response");
  for (const spec of normalized.presentation.components) renderWidget(surface, spec, onSubmit, turnId);
  container.append(surface);
  return surface;
}

function renderWidget(container, spec, onSubmit, turnId) {
  const kind = spec.kind || (spec.schema ? "form" : "info");
  const card = document.createElement("div");
  card.className = "ns-widget";
  card.dataset.componentId = spec.id || "welcome";
  const submit = async (text, data) => {
    lockWidget(card);
    try {
      const accepted = await onSubmit(text, { turnId, componentId: spec.id || "welcome", kind, ...data, ...(spec.submit?.actions || kind === "action" ? { executeActions: true } : {}) });
      if (accepted === false) lockWidget(card, false);
    } catch { lockWidget(card, false); }
  };
  // spec.color is untrusted (LLM/partner-supplied). Only accept a plain CSS color
  // token (#hex, rgb()/hsl(), or a bare keyword) so it can't smuggle extra CSS.
  if (spec.color && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|hsl)a?\([0-9.,%\s/]+\))$/.test(String(spec.color).trim())) {
    card.style.setProperty("--w", String(spec.color).trim());
  }
  let html = `<div class="ns-w-head">${spec.icon ? `<span class="ns-w-icon">${escapeHtml(spec.icon)}</span>` : ""}<b>${escapeHtml(spec.title || "")}</b></div>`;
  if (spec.description) html += `<div class="ns-w-desc">${escapeHtml(spec.description)}</div>`;

  if (kind === "action") {
    card.innerHTML = html;
    const button = document.createElement("button");
    button.className = "ns-w-btn"; button.textContent = spec.label || "Review action";
    button.onclick = () => submit(button.textContent, {});
    card.append(button);
  } else if (["report", "table", "chart", "html"].includes(kind)) {
    card.innerHTML = html;
    const body = document.createElement("div");
    renderRichComponent(body, spec);
    card.append(body);
  } else if (kind === "confirm") {
    html += `<div class="ns-w-actions"><button class="ns-w-btn" data-act="confirm">${escapeHtml(spec.confirmLabel || "Confirm")}</button><button class="ns-w-btn ghost" data-act="cancel">${escapeHtml(spec.cancelLabel || "Cancel")}</button></div>`;
    card.innerHTML = html;
    card.querySelector('[data-act="confirm"]').addEventListener("click", () => submit(spec.confirmText || spec.confirmLabel || "Confirm", { action: "confirm" }));
    card.querySelector('[data-act="cancel"]').addEventListener("click", () => submit(spec.cancelText || "Not yet, hold off.", { action: "cancel" }));
  } else if (kind === "choice") {
    html += `<div class="ns-w-choices">` + (spec.options || []).map((o, idx) =>
      `<button class="ns-w-choice" data-idx="${idx}"><div class="ns-w-ctitle">${escapeHtml(o.title || o.value || "")}</div>${o.subtitle ? `<div class="ns-w-csub">${escapeHtml(o.subtitle)}</div>` : ""}${o.meta ? `<div class="ns-w-cmeta">${escapeHtml(o.meta)}</div>` : ""}</button>`).join("") + `</div>`;
    card.innerHTML = html;
    card.querySelectorAll(".ns-w-choice").forEach((b) => b.addEventListener("click", () => {
      const o = (spec.options || [])[+b.dataset.idx];
      submit(`${spec.choosePrefix || "I'll go with"}: ${o.title || o.value}`, { value: o.value ?? o.title });
    }));
  } else if (kind === "info") {
    html += `<div class="ns-w-fields">` + Object.entries(spec.fields || {}).map(([k, v]) =>
      `<div class="ns-w-field"><span class="ns-w-fk">${escapeHtml(k)}</span><span class="ns-w-fv">${escapeHtml(String(v))}</span></div>`).join("") + `</div>`;
    card.innerHTML = html;
  } else { // form
    const props = (spec.schema && spec.schema.properties) || {};
    const required = (spec.schema && spec.schema.required) || [];
    const entries = Object.entries(props);
    html += `<form class="ns-w-form">` + entries.map(([key, f], i) => renderField("f" + i, key, f, required.includes(key))).join("") +
      `<div class="ns-w-actions"><button type="submit" class="ns-w-btn">${escapeHtml(spec.submitLabel || "Submit")}</button></div></form>`;
    card.innerHTML = html;
    entries.forEach(([key, field], i) => {
      const control = card.querySelector(`[data-field="f${i}"]`) || card.querySelector(`input[name="f${i}"]`);
      if (!control) return;
      control.id = `${turnId || "welcome"}-${spec.id || "welcome"}-f${i}`;
      const label = control.closest(".ns-w-row")?.querySelector(".ns-w-label");
      if (label?.tagName === "LABEL") label.htmlFor = control.id;
      const description = control.closest(".ns-w-row")?.querySelector(".ns-w-fdesc");
      if (description) {
        description.id = `${control.id}-description`;
        control.setAttribute("aria-describedby", description.id);
      }
      if (required.includes(key) && field.type !== "boolean" && field.type !== "array") control.required = true;
      if (field.type === "number") control.step = "any";
      if (field.type === "integer") control.step = "1";
      if (field.default !== undefined) {
        if (field.type === "boolean") control.checked = field.default === true;
        else if (field["x-ui"]?.widget === "radio") {
          card.querySelectorAll(`input[name="f${i}"]`).forEach((el) => { el.checked = el.value === String(field.default); });
        } else if (field.type !== "array") control.value = String(field.default);
      }
    });
    card.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const vals = collectForm(card, entries);
      const summary = (spec.title ? `${spec.title} — ` : "") +
        Object.entries(vals).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && v.length === 0))
          .map(([k, v]) => `${props[k]?.title || k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ");
      submit(summary || "(submitted)", { values: vals });
    });
  }
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
  return card;
}

// Render the network as a hierarchy of boxes joined by elbow connectors: the
// front-man is the root, each agent's `tools` nest beneath it (sub-agents recurse;
// MCP/remote/coded tools are typed leaf boxes). A shared sub-agent is expanded once;
// later references show as "↩ name" (also breaks cycles). The active agent/origin
// box glows + its dot pulses.
function renderNodes(el, net, activeAgents, activeOrigins = new Set()) {
  if (!net) return;
  const tools = net.config.tools || [];
  const specByName = new Map(tools.filter((a) => a && a.name).map((a) => [a.name, a]));
  const isAgent = (n) => { const s = specByName.get(n); return !!(s && s.instructions && !s.class && !s.toolbox); };
  const hostOfRef = (ref) => { try { return new URL(ref).host; } catch { return String(ref); } };
  const front = net.findFrontMan();
  const rendered = new Set();

  function box(cls, icon, label, { active = false, dot = false, title = "" } = {}) {
    return `<div class="ns-tbox ${cls}${active ? " active" : ""}"${title ? ` title="${escapeHtml(title)}"` : ""}>` +
      `${icon ? `<span class="ns-ticon">${icon}</span>` : ""}<span>${escapeHtml(label)}</span>` +
      `${dot ? '<span class="ns-tdot"></span>' : ""}</div>`;
  }

  function node(name) {
    const spec = specByName.get(name);
    rendered.add(name);
    const kids = [];
    for (const ref of spec?.tools || []) {
      let kind = "missing";
      try { kind = net.classifyTool(ref).kind; } catch {}
      if (kind === "agent" && isAgent(ref)) {
        kids.push(`<li>${rendered.has(ref) ? box("leaf", "↩", ref, { title: "defined above" }) : node(ref)}</li>`);
      } else if (kind === "mcp") {
        const h = hostOfRef(ref); kids.push(`<li>${box("leaf", "🌐", h, { active: activeOrigins.has(h) })}</li>`);
      } else if (kind === "remote") {
        const h = hostOfRef(ref); kids.push(`<li>${box("leaf", "🏢", h, { active: activeOrigins.has(h) })}</li>`);
      } else if (kind === "link") {
        kids.push(`<li>${box("leaf", "🔗", ref, { title: "pending agent-network link" })}</li>`);
      } else if (kind === "coded" || kind === "toolbox") {
        kids.push(`<li>${box("leaf", "⚙", typeof ref === "string" ? ref : (ref.url || "tool"))}</li>`);
      }
    }
    const self = box("agent" + (name === front ? " root" : ""), "", name,
      { active: activeAgents.has(name), dot: true, title: spec?.function?.description || "" });
    return self + (kids.length ? `<ul class="ns-tchildren">${kids.join("")}</ul>` : "");
  }

  const top = [];
  if (front) top.push(`<li>${node(front)}</li>`);
  for (const n of specByName.keys()) if (isAgent(n) && !rendered.has(n)) top.push(`<li>${node(n)}</li>`);  // orphans
  el.innerHTML = `<ul class="ns-tree">${top.join("")}</ul>`;
}

function rowLabel(ev) {
  const tag = ev.kind === "model_call" && ev.mock ? "MOCK" : KIND_TAG[ev.kind] || ev.kind.toUpperCase();
  let detail = "";
  switch (ev.kind) {
    case "run": detail = escapeHtml(ev.input || ""); break;
    case "agent": detail = `${escapeHtml(ev.agent)} <span class="ns-meta">@ ${escapeHtml(ev.origin || "")}</span>`; break;
    case "model_call": {
      const via = ev.routerHost ? ` via ${escapeHtml(ev.routerHost)}` : "";
      const flag = ev.mock ? ' <span style="color:#b45309;font-weight:700">[MOCK — not a real LLM]</span>' : "";
      detail = `${escapeHtml(ev.model || "")}${flag} <span class="ns-meta">${via} · key: ${escapeHtml(ev.keySource || "")}</span>`;
      break;
    }
    case "tool_call": detail = `${escapeHtml(ev.tool || "")} <span class="ns-meta">(${escapeHtml(ev.toolKind || "")})</span>`; break;
    case "rest_call": detail = `${escapeHtml(ev.method || "GET")} ${escapeHtml(ev.url || "")}`; break;
    case "remote_fetch": detail = `${escapeHtml(ev.brand || ev.network || ev.peerOrigin || "")} <span class="ns-meta">${escapeHtml(ev.peerOrigin || ev.url || "")}</span>`; break;
    case "remote_call": detail = `${escapeHtml(ev.brand || ev.network || ev.peerOrigin || "")} <span class="ns-meta">@ ${escapeHtml(ev.peerOrigin || "")} · via ${escapeHtml(ev.method || "")}</span>`; break;
    case "mcp_call": detail = `${escapeHtml(ev.method || "")} <span class="ns-meta">@ ${escapeHtml(ev.peerOrigin || "")}</span>`; break;
    case "tool_result": detail = `${escapeHtml(ev.tool || "")} <span class="ns-meta">${escapeHtml((ev.preview || "").slice(0, 80))}</span>`; break;
    case "presentation_proposal": detail = `${escapeHtml(ev.agent || "")} <span class="ns-meta">${ev.presentation?.components?.length || 0} components</span>`; break;
    default: detail = "";
  }
  return `<span class="ns-tag">${tag}</span>${detail}`;
}

function detailJson(ev) {
  const keep = {};
  for (const k of ["fetchedUrls", "requestPayload", "args", "result", "presentation", "issues", "invocation", "headers", "toolNames", "usage", "responsePreview", "preview", "errors", "warnings", "peers", "error", "httpStatus", "url", "method", "endpoint", "routerHost", "mock"]) {
    if (ev[k] !== undefined) keep[k] = ev[k];
  }
  return Object.keys(keep).length ? JSON.stringify(keep, null, 2) : "";
}

function addRow(rows, ev, marker) {
  const div = document.createElement("div");
  div.className = `ns-row k-${ev.kind}` + (ev.status === "error" ? " status-error" : "");
  if (ev.id) div.dataset.id = ev.id;
  const json = detailJson(ev);
  div.innerHTML = `<div class="ns-line">${rowLabel(ev)}</div>` + (json ? `<pre style="display:none">${escapeHtml(json)}</pre>` : "");
  if (json) {
    div.addEventListener("click", () => {
      const pre = div.querySelector("pre");
      pre.style.display = pre.style.display === "none" ? "block" : "none";
    });
  }
  rows.appendChild(div);
}

function updateRow(rows, ev) {
  const existing = ev.id ? rows.querySelector(`[data-id="${ev.id}"]`) : null;
  if (!existing) {
    addRow(rows, ev, "✓");
    return;
  }
  if (ev.status === "error") existing.classList.add("status-error");
  const ms = ev.durationMs != null ? ` <span class="ns-meta">· ${Math.round(ev.durationMs)}ms</span>` : "";
  const err = ev.error ? ` <span class="ns-meta" style="color:#dc2626">· ${escapeHtml(ev.error)}</span>` : "";
  existing.querySelector(".ns-line").innerHTML = rowLabel(ev) + ms + err;
  const json = detailJson(ev);
  if (json) {
    let pre = existing.querySelector("pre");
    if (!pre) {
      pre = document.createElement("pre");
      pre.style.display = "none";
      existing.appendChild(pre);
      existing.addEventListener("click", () => {
        pre.style.display = pre.style.display === "none" ? "block" : "none";
      });
    }
    pre.textContent = json;
  }
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
