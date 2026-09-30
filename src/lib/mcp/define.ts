import type { z, ZodRawShape, ZodTypeAny } from "zod";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * JurisCore's MCP server definition. The six tools are plain objects; `http.ts` serves them
 * over the official MCP SDK's streamable HTTP transport.
 */

type ShapeOutput<T extends ZodRawShape> = z.infer<z.ZodObject<T>>;

export type ToolHandlerResult = Pick<CallToolResult, "content" | "structuredContent" | "isError">;

export interface ToolDefinition<TInput extends ZodRawShape | undefined = ZodRawShape | undefined> {
  readonly name: string;
  /** Display name shown to the user in MCP clients. */
  readonly title: string;
  /** Prose the model reads to decide whether to call this tool. */
  readonly description: string;
  /** A raw zod shape (`{ text: z.string() }`); the SDK wraps it in an object schema. */
  readonly inputSchema?: TInput;
  readonly outputSchema?: ZodRawShape;
  readonly annotations?: ToolAnnotations;
  readonly handler: TInput extends ZodRawShape
    ? (args: ShapeOutput<TInput>) => ToolHandlerResult | Promise<ToolHandlerResult>
    : () => ToolHandlerResult | Promise<ToolHandlerResult>;
}

/** Type-erased element of `McpDefinition.tools`; typing happens at each `defineTool` call. */
export interface AnyToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema?: Record<string, ZodTypeAny>;
  readonly outputSchema?: Record<string, ZodTypeAny>;
  readonly annotations?: ToolAnnotations;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly handler: (args: any) => ToolHandlerResult | Promise<ToolHandlerResult>;
}

export interface McpDefinition {
  readonly name: string;
  readonly title: string;
  readonly version: string;
  readonly instructions?: string;
  /** Always false: no usage telemetry leaves the operator's environment. */
  readonly metrics: false;
  readonly tools: readonly AnyToolDefinition[];
}

export function defineTool<TInput extends ZodRawShape | undefined = undefined>(
  def: ToolDefinition<TInput>,
): ToolDefinition<TInput> {
  return def;
}

function assertNonEmptyString(field: string, value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`defineMcp: \`${field}\` must be a non-empty string`);
  }
}

/** Validates the definition (names, unique tool names) and freezes it. */
export function defineMcp(def: McpDefinition): McpDefinition {
  assertNonEmptyString("name", def.name);
  assertNonEmptyString("title", def.title);
  assertNonEmptyString("version", def.version);
  const seen = new Set<string>();
  for (const tool of def.tools) {
    assertNonEmptyString("tool name", tool.name);
    if (seen.has(tool.name)) throw new Error(`defineMcp: duplicate tool name "${tool.name}"`);
    seen.add(tool.name);
  }
  for (const tool of def.tools) Object.freeze(tool);
  Object.freeze(def.tools);
  return Object.freeze(def);
}
