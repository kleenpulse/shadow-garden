// langchain-runner.mjs — the AgentRunner intrinsic built on LangChain.js ONLY.
//
// neuro-san-web owns the agent graph and the loop; LangChain.js provides just the
// model + tool-binding interface (ChatOpenAI.bindTools) and message types. There is
// no LangGraph here — the multi-agent orchestration (peer agents, fetch-and-run
// remote networks, sandboxed coded tools, MCP) is neuro-san-web's job, driven by the
// shared buildToolTable()/dispatchToolCall() helpers. Bundled for the browser by
// build/bundle-runner.mjs.

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { ProviderError } from "./provider-error.js";

function hostOf(url) {
  try { return new URL(url).host; } catch { return url || "?"; }
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : p.text || "")).join("");
  return "";
}

export async function runAgentLangChain(ctx, agentName, userText, parentSpan, chain, helpers) {
  const { trace, network } = ctx;
  const spec = network.getAgentSpec(agentName);
  if (!spec) throw new Error(`agent '${agentName}' not found`);

  const origin = ctx.displayOrigin;
  const isTopFrontMan = ctx.isTop && agentName === ctx.frontMan;
  const agentSpan = trace.start("agent", {
    parent: parentSpan, origin, agent: agentName, network: network.name,
    displayAs: spec.class ? "coded_tool" : "llm_agent", runner: "langchain",
    invocation: ctx.invocation, isTopFrontMan,
  });

  try {
    const { toolByName, toolSchemas } = await helpers.buildToolTable(ctx, spec, chain, agentSpan);

    // LangChain tool specs (schema only — we execute tool calls ourselves below).
    const lcTools = toolSchemas.map((s) =>
      tool(async () => "", { name: s.function.name, description: s.function.description, schema: s.function.parameters }),
    );

    const sysParts = [];
    if (spec.instructions) sysParts.push(spec.instructions.trim());
    if (spec.command) sysParts.push(spec.command.trim());
    const prompt = sysParts.join("\n\n") || "You are a helpful agent.";

    const model = ctx.modelOverride || spec.llm_config?.model_name || network.config.llm_config?.model_name || ctx.defaultModel;
    // A real (non-mock) router with no API key: refuse rather than forward the
    // placeholder "demo" to a live provider (which returns a confusing 401, e.g.
    // when a shared/reloaded URL keeps the proxy router but the per-tab key is gone).
    if (!ctx.mock && (!ctx.apiKey || ctx.apiKey === "demo")) {
      throw new Error(`An AI provider key is required for ${hostOf(ctx.routerBaseUrl) || "the configured provider"}. Open ⚙ AI model settings, paste your key, then select Save and start. Your key stays in this browser and is sent only to the configured provider.`);
    }
    const keySource = ctx.apiKey ? "local BYOK (not shown)" : "none";

    const llm = new ChatOpenAI({
      model,
      apiKey: ctx.apiKey || "none",
      streaming: true,
      temperature: 0,
      configuration: { baseURL: ctx.routerBaseUrl, dangerouslyAllowBrowser: true },
    });
    const chat = lcTools.length ? llm.bindTools(lcTools) : llm;

    const messages = [new SystemMessage(prompt)];
    if (isTopFrontMan && ctx.history?.length) {
      for (const m of ctx.history) {
        messages.push(m.role === "assistant" ? new AIMessage(m.content) : new HumanMessage(m.content));
      }
    }
    messages.push(new HumanMessage(userText));
    const maxSteps = spec.max_steps || network.config.max_steps || 12;

    let finalText = "";
    for (let step = 0; step < maxSteps; step++) {
      if (isTopFrontMan) {
        helpers.applyPendingSteering(ctx.turnControl, (text) => messages.push(new HumanMessage(text)));
      }
      const span = trace.start("model_call", {
        parent: agentSpan, origin, model, mock: ctx.mock,
        routerHost: hostOf(ctx.routerBaseUrl), keySource, runner: "langchain",
      });
      let ai = null;
      try {
        const attempt = await helpers.runInterruptibleModelCall(isTopFrontMan ? ctx.turnControl : null, async (signal) => {
          let response = null;
          const stream = await chat.stream(messages, { signal });
          for await (const chunk of stream) {
            response = response ? response.concat(chunk) : chunk;
            const piece = textOf(chunk.content);
            if (piece && !signal?.aborted) { if (isTopFrontMan) ctx.onAnswerDelta?.(piece); trace.update(span, { streamChunk: piece }); }
          }
          return response;
        });
        if (attempt.interrupted) {
          trace.end(span, { status: "steered", interrupted: true });
          step -= 1;
          continue;
        }
        ai = attempt.value;
        const respModel = ai?.response_metadata?.model_name || ai?.response_metadata?.model || ai?.lc_kwargs?.response_metadata?.model_name;
        const respMock = ctx.mock || /neuro-san-mock/.test(respModel || "");
        trace.end(span, { usage: ai?.usage_metadata, toolCalls: (ai?.tool_calls || []).map((t) => t.name), mock: respMock, respModel });
      } catch (err) {
        const friendlyError = ProviderError.friendly(err, ctx.routerBaseUrl);
        trace.fail(span, friendlyError);
        throw friendlyError;
      }

      if (isTopFrontMan && ctx.turnControl?.pending.length) {
        step -= 1;
        continue;
      }

      messages.push(ai);
      const toolCalls = ai?.tool_calls || [];
      if (toolCalls.length === 0) {
        finalText = textOf(ai?.content);
        break;
      }
      const calls = toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        args: tc.args || {},
        entry: toolByName.get(tc.name),
      }));
      const toolResults = await helpers.executeToolCalls(ctx, calls, agentSpan, chain);
      for (const result of toolResults) {
        messages.push(new ToolMessage({ content: result.content, tool_call_id: result.id, name: result.name }));
        trace.note("tool_result", { parent: agentSpan, origin, tool: result.name, preview: result.content.slice(0, 200) });
      }
    }

    // The shared runAgent boundary returns text + the presentation proposal to
    // our caller, so both runners use exactly the same CRUSE contract.
    trace.end(agentSpan, { answerChars: finalText.length });
    return finalText;
  } catch (err) {
    trace.fail(agentSpan, err);
    throw err;
  }
}

export default runAgentLangChain;
