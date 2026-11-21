import { serveActionBridge } from "./action-transport.js";
serveActionBridge().catch(error => { document.body.textContent = `Action bridge error: ${error.message}`; });
