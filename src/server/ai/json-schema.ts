import { z } from "zod";

type JSONSchema = Record<string, unknown>;

const UNSUPPORTED_KEYS = new Set(["$schema", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "pattern", "default"]);

/**
 * Converts a Zod schema into a JSON Schema accepted by strict structured-output modes
 * (Anthropic output_config.format, OpenAI json_schema strict, Claude Code --json-schema):
 * no numeric/string constraints, `type: [x, "null"]` rewritten as anyOf, additionalProperties false everywhere.
 */
export function toStructuredOutputSchema(schema: z.ZodType): JSONSchema {
  const raw = z.toJSONSchema(schema, { target: "draft-2020-12", io: "output", unrepresentable: "any" }) as JSONSchema;
  return clean(raw) as JSONSchema;
}

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const input = node as JSONSchema;
  const out: JSONSchema = {};
  for (const [key, value] of Object.entries(input)) {
    if (UNSUPPORTED_KEYS.has(key)) continue;
    if (key === "format" && typeof value === "string" && !["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"].includes(value)) continue;
    out[key] = clean(value);
  }
  if (Array.isArray(out.type)) {
    const types = out.type as string[];
    const { type: _t, ...rest } = out;
    void _t;
    const variants = types.map((t) => (t === "null" ? { type: "null" } : { ...rest, type: t }));
    return { anyOf: variants };
  }
  if (out.type === "object" && out.properties && out.additionalProperties === undefined) out.additionalProperties = false;
  return out;
}
