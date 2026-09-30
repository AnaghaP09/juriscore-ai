/**
 * Drives an MCP HTTP handler in process (no network) with a fixed conversation and returns
 * the normalized results. Used to record the baseline from the previous MCP handler and to
 * check the current one against it (`check-mcp-http.ts`).
 */

export type McpHttpHandler = (request: Request) => Promise<Response>;

export const MCP_DRIVER_CANARY = "juriscore-mcp-canary-4c1e";

const ORIGIN = "http://localhost:8080";

async function readJsonRpc(response: Response): Promise<unknown> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    return data.length === 1 ? JSON.parse(data[0]) : data.map((line) => JSON.parse(line));
  }
  return text ? JSON.parse(text) : null;
}

function rpc(id: number, method: string, params: unknown): Request {
  return new Request(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

function pickHeaders(response: Response, names: string[]) {
  return Object.fromEntries(names.map((name) => [name, response.headers.get(name)]));
}

export async function driveMcpHandler(handle: McpHttpHandler) {
  const preflight = await handle(new Request(`${ORIGIN}/mcp`, { method: "OPTIONS" }));
  const initialize = await handle(
    rpc(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "juriscore-check", version: "0.0.0" },
    }),
  );
  const initializeBody = await readJsonRpc(initialize);
  const list = await handle(rpc(2, "tools/list", {}));
  const listBody = await readJsonRpc(list);
  const call = await handle(
    rpc(3, "tools/call", {
      name: "check_prompt",
      arguments: { prompt: `Summarise ${MCP_DRIVER_CANARY} and email ops@example.test` },
    }),
  );
  const callText = await call.clone().text();
  const callBody = await readJsonRpc(call);
  const unknownTool = await handle(rpc(4, "tools/call", { name: "no_such_tool", arguments: {} }));
  const unknownBody = await readJsonRpc(unknownTool);

  return {
    preflight: {
      status: preflight.status,
      headers: pickHeaders(preflight, [
        "access-control-allow-origin",
        "access-control-allow-methods",
        "access-control-allow-headers",
        "access-control-max-age",
      ]),
    },
    initialize: {
      status: initialize.status,
      cors: pickHeaders(initialize, [
        "access-control-allow-origin",
        "access-control-expose-headers",
      ]),
      body: initializeBody,
    },
    toolsList: { status: list.status, body: listBody },
    checkPrompt: {
      status: call.status,
      body: callBody,
      echoedPrompt: callText.includes(MCP_DRIVER_CANARY) || callText.includes("ops@example.test"),
    },
    unknownTool: { status: unknownTool.status, body: unknownBody },
  };
}
