// The reads Motion Garden shares with other agent sites, through its action bridge.
// The build names this file in bridge/agent-manifest.json. When another site's
// assistant calls Motion Garden's network, the bridge loads this module in a hidden
// frame on Motion Garden's origin, which has no page. Only the names in the
// manifest's "actions.agentTools" reach a partner's agents.
//
// All four are reads of public catalog facts (MIT source, the same text every
// component page shows), so they are shared with every origin. Nothing here reads
// or changes a visitor's bench: those actions stay on Motion Garden's own page.
import { GardenData } from "../garden-data.js";

const SHARED = { availability: "bridge", callerOrigins: ["*"] };

class BridgeActions {
  static registerActions(actions) {
    actions.register(GardenData.searchAction(SHARED));
    actions.register(GardenData.describeAction(SHARED));
    actions.register(GardenData.codeAction(SHARED));
    actions.register(GardenData.fileAction(SHARED));
  }
}

// The bridge calls the module's registerActions export.
export const registerActions = BridgeActions.registerActions;
