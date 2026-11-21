// turn-status.js — user-facing projection of detailed execution events.
//
// The trace and stream APIs retain every event for developer consumers. This
// controller deliberately reduces them to one transient, non-technical status
// line for the chat UI.

function humanize(value, fallback) {
  const text = String(value || "")
    .replace(/^mcp_/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function concise(value, limit = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function statusTextForEvent(event) {
  const agent = humanize(event.source?.agent, "An agent");
  const tool = humanize(event.tool?.name, "A service");
  switch (event.type) {
    case "turn.started": return "Planning your request…";
    case "turn.steering.received": return "Update received; adjusting the plan…";
    case "turn.steering.applied": return "Applying your latest guidance…";
    case "agent.started": return `${agent} is working…`;
    case "agent.completed": return `${agent} finished; bringing the answer together…`;
    case "agent.failed": return `${agent} could not complete; continuing with available results…`;
    case "tool.started": {
      if (event.tool?.kind === "agent") return `Asking ${tool}…`;
      if (event.tool?.kind === "remote network" || event.tool?.kind === "linked network") return `Contacting ${tool}…`;
      if (event.tool?.kind === "MCP") return `Checking ${tool}…`;
      return `Running ${tool}…`;
    }
    case "tool.progress":
      return concise(event.message || event.progress?.message) || `${tool} is still working…`;
    case "tool.completed": return `${tool} finished; reviewing the result…`;
    case "tool.failed": return `${tool} could not complete; continuing with available results…`;
    default: return "";
  }
}

export function createTurnStatusController({ show, hide }) {
  let visible = false;
  const clear = () => {
    if (visible) hide();
    visible = false;
  };
  return {
    handle(event) {
      if (event.type === "turn.completed" || event.type === "turn.failed") {
        clear();
        return;
      }
      const text = statusTextForEvent(event);
      if (!text) return;
      visible = true;
      show(text, event);
    },
    finalAnswerStarted: clear,
    clear,
    get visible() { return visible; },
  };
}
