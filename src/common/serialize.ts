import { Decimal } from "@prisma/client/runtime/library";

/**
 * Recursively converts Prisma Decimal instances to JS numbers so the response
 * is JSON-friendly. Skips plain Date objects (they serialize to ISO strings on
 * their own).
 */
export function serialize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value as T;
  if (value instanceof Decimal) return Number(value) as unknown as T;
  if (Array.isArray(value)) return value.map(serialize) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out as T;
  }
  return value;
}
