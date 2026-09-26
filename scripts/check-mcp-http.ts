import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mcp from "../src/lib/mcp/index";
import { createMcpHttpHandler } from "../src/lib/mcp/http";
import { driveMcpHandler } from "./mcp-http-driver";

// The /mcp endpoint answers exactly as the previous (vendor-generated) handler did.
// The baseline was recorded from that handler at 6d25c6c with the same driver.
const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(
  readFileSync(resolve(here, "fixtures/mcp-http-baseline.json"), "utf8"),
) as Awaited<ReturnType<typeof driveMcpHandler>>;

const current = await driveMcpHandler(createMcpHttpHandler(mcp));

assert.deepEqual(current.preflight, baseline.preflight, "CORS preflight changed");
assert.deepEqual(current.initialize, baseline.initialize, "initialize changed");
assert.deepEqual(current.toolsList, baseline.toolsList, "tools/list changed");
assert.deepEqual(current.checkPrompt, baseline.checkPrompt, "check_prompt result changed");
assert.equal(current.checkPrompt.echoedPrompt, false, "check_prompt echoed the prompt");
assert.deepEqual(current.unknownTool, baseline.unknownTool, "unknown-tool error changed");

// A throwing tool returns a fixed message, never the error text (it may quote the input).
{
  const handle = createMcpHttpHandler({
    ...mcp,
    tools: [
      {
        name: "boom",
        title: "Boom",
        description: "Always throws.",
        handler: () => {
          throw new Error("secret-input-value");
        },
      },
    ],
  });
  const response = await handle(
    new Request("http://localhost:8080/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "boom", arguments: {} },
      }),
    }),
  );
  const text = await response.text();
  assert.ok(text.includes("tool execution failed"));
  assert.equal(text.includes("secret-input-value"), false, "the error text leaked");
}

console.log("JurisCore MCP HTTP checks passed.");
