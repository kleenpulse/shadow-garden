// Registers Motion Garden's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// The bench's state lives in the Next app (the URL, through nuqs). The app publishes
// its operations on window.__motionGarden (lib/agent/bench-bridge.ts); this file only
// wraps them and the catalog reads in garden-data.js. No business rule lives here:
// control ranges, options and refusals come from the registry's own PropSchema.
import { GardenData } from "./garden-data.js";

const NOT_READY = {
  ok: false,
  reason: "The bench is still loading. Ask the visitor to wait a moment, then try again.",
  field: "page",
};

const CHANGES = {
  type: "array",
  minItems: 1,
  maxItems: 12,
  description: "Controls to set, each by its name from the bench state.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["name", "value"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 60, description: "The control's name, exactly as the bench state lists it." },
      value: {
        type: "string",
        minLength: 1,
        maxLength: 40,
        description: "The new value as text: a number such as 1.5, true or false, one of the control's options, or a hex color such as #a855f7.",
      },
    },
  },
};

function bench() {
  return typeof window !== "undefined" ? window.__motionGarden : undefined;
}

class SiteActions {
  static registerActions(actions) {
    actions.register(SiteActions.stateAction());
    actions.register(GardenData.searchAction());
    actions.register(GardenData.describeAction());
    actions.register(GardenData.codeAction());
    actions.register(SiteActions.openAction());
    actions.register(SiteActions.setAction());
    actions.register(SiteActions.resetAction());
  }

  static stateAction() {
    return {
      name: "get_bench_state",
      description:
        "Read what the visitor sees now: the page path, the open component (slug, name, category) and each of its controls with its current value, default and allowed range or options. Changes nothing. Call it before changing controls, and again in each turn that needs current values: the visitor can also move the controls by hand.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => bench()?.getState() ?? NOT_READY,
    };
  }

  static openAction() {
    return {
      name: "open_component",
      description:
        "Call it only when the visitor asks to see, open or try a component. Opens its page on this site, optionally with starting control values, and returns the new bench state. Use a slug from website_search_components. The visitor can go back to the page they were on.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["slug"],
        properties: {
          slug: { type: "string", minLength: 1, maxLength: 80, description: "A slug from website_search_components." },
          changes: { ...CHANGES, minItems: 0, description: "Optional starting values, with names from website_describe_component." },
        },
      },
      execute: (args) => bench()?.openComponent(args) ?? NOT_READY,
    };
  }

  static setAction() {
    return {
      name: "set_controls",
      description:
        "Call it only when the visitor asks to change how the open component looks or moves. Sets the named controls on the live preview, all or none: a value outside a control's range or options is refused with the reason, and nothing changes. In the same turn, read website_get_bench_state first for the control names, ranges and options. Returns the new bench state.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["changes"],
        properties: { changes: CHANGES },
      },
      execute: (args) => bench()?.setControls(args) ?? NOT_READY,
    };
  }

  static resetAction() {
    return {
      name: "reset_controls",
      description: "Call it only when the visitor asks to reset. Puts every control of the open component back to its default and returns the bench state.",
      effect: "write",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => bench()?.resetControls() ?? NOT_READY,
    };
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
