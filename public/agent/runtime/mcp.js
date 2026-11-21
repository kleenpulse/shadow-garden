// mcp.js — an MCP (Model Context Protocol) client.
//
// Lets a browser-run agent call a HOSTED MCP server over JSON-RPC 2.0 / HTTP
// (protocol 2025-06-18): initialize -> notifications/initialized -> tools/list ->
// tools/call. This is fully compatible with the serverless model — the browser is
// an MCP *client*; the MCP server is hosted elsewhere. The only constraint is CORS:
// the hosted server (or a proxy) must allow the browser origin. Per-server auth
// headers can be supplied via sly_data.http_headers[serverUrl].

const PROTOCOL_VERSION = "2025-06-18";

export class McpClient {
  constructor({ url, trace, headers, onProgress } = {}) {
    this.url = url;
    this.trace = trace;
    this.headers = headers || {};
    this.onProgress = onProgress;
    this.sessionId = null;
    this.initialized = null; // a promise, once
    this.rpcId = 0;
  }

  async _rpc(method, params, { parentSpan, notification = false } = {}) {
    const span = this.trace?.start("mcp_call", {
      parent: parentSpan, peerOrigin: hostOf(this.url), url: this.url, method, args: params,
    });
    try {
      const body = { jsonrpc: "2.0", method, params: params || {} };
      if (!notification) body.id = ++this.rpcId;
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
        ...this.headers,
      };
      if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

      const resp = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) });
      const sid = resp.headers.get("Mcp-Session-Id");
      if (sid) this.sessionId = sid;
      if (notification) { this.trace?.end(span, { status: "ok", notification: true }); return null; }

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`MCP HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      const json = await readJsonRpcResponse(resp, body.id, (notice) => {
        const params = notice.params || {};
        const message = params.message || params.data?.message || (typeof params.data === "string" ? params.data : "");
        const progress = params.progress ?? params.data ?? params;
        this.trace?.note("tool_progress", {
          parent: span,
          peerOrigin: hostOf(this.url),
          toolKind: "MCP",
          method: notice.method,
          progress,
          message,
        });
        this.onProgress?.({ method: notice.method, progress, message, params });
      });
      if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
      this.trace?.end(span, { status: "ok" });
      return json.result;
    } catch (err) {
      this.trace?.fail(span, err);
      throw err;
    }
  }

  async ensureInit(parentSpan) {
    if (this.initialized) return this.initialized;
    this.initialized = (async () => {
      await this._rpc("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "neuro-san-web", title: "neuro-san-web MCP client", version: "0.1.0" },
      }, { parentSpan });
      await this._rpc("notifications/initialized", {}, { parentSpan, notification: true });
    })();
    return this.initialized;
  }

  async listTools(parentSpan) {
    await this.ensureInit(parentSpan);
    const result = await this._rpc("tools/list", {}, { parentSpan });
    return result?.tools || [];
  }

  async callTool(name, args, parentSpan) {
    await this.ensureInit(parentSpan);
    const result = await this._rpc("tools/call", { name, arguments: args || {} }, { parentSpan });
    const parts = (result?.content || []).map((c) => (c.type === "text" ? c.text : JSON.stringify(c)));
    const text = parts.join("\n");
    return result?.isError ? `MCP tool error: ${text}` : text;
  }
}

// Consume MCP SSE incrementally so notifications are observable while a long
// tool is still running. Plain JSON responses retain the simple buffered path.
export async function readJsonRpcResponse(resp, expectId, onNotification) {
  const contentType = resp.headers?.get?.("content-type") || "";
  if (!/text\/event-stream/i.test(contentType) || !resp.body?.getReader) {
    const text = await resp.text();
    return parseMaybeSse(text, expectId, onNotification);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fallback = null;

  const accept = (payload) => {
    if (!payload || payload === "[DONE]") return null;
    let json;
    try { json = JSON.parse(payload); } catch { return null; }
    if (!("result" in json) && !("error" in json)) {
      onNotification?.(json);
      return null;
    }
    if (expectId == null || json.id === expectId) return json;
    if (!fallback) fallback = json;
    return null;
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const payload = block.split("\n")
        .filter((line) => line.trimStart().startsWith("data:"))
        .map((line) => line.slice(line.indexOf(":") + 1).trimStart())
        .join("\n");
      const response = accept(payload);
      if (response) {
        try { await reader.cancel(); } catch { /* response is already complete */ }
        return response;
      }
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const payload = buffer.split("\n")
      .filter((line) => line.trimStart().startsWith("data:"))
      .map((line) => line.slice(line.indexOf(":") + 1).trimStart())
      .join("\n");
    const response = accept(payload);
    if (response) return response;
  }
  if (fallback) return fallback;
  throw new Error("unparseable MCP response");
}

// MCP servers may answer JSON-RPC as plain JSON or as an SSE stream. The stream can
// carry server notifications (e.g. `notifications/message` log lines — You.com emits
// one before every tools/call result) ahead of the actual response, so pick the
// event that is a JSON-RPC response (has `result` or `error`), preferring the one
// whose id matches the request.
export function parseMaybeSse(text, expectId, onNotification) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  let fallback = null;
  for (const line of trimmed.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("data:")) continue;
    const payload = l.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    let json;
    try { json = JSON.parse(payload); } catch { continue; }
    if (!("result" in json) && !("error" in json)) {
      onNotification?.(json);
      continue;
    }
    if (expectId == null || json.id === expectId) return json;
    if (!fallback) fallback = json;
  }
  if (fallback) return fallback;
  throw new Error("unparseable MCP response");
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}
