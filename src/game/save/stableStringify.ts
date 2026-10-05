import type { JsonValue } from "../engine/EventBus";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";

/**
 * Canonical JSON text of a value (DECISIONS D-05): object keys sorted by code unit, arrays kept
 * in order, no whitespace. Identical state therefore always yields an identical string. Anything
 * that is not plain integer JSON (`NaN`, `Infinity`, fractions, `-0`, `undefined`, functions) is
 * rejected instead of being silently altered by `JSON.stringify`.
 *
 * @param value - A JSON value with safe-integer numbers only.
 * @returns The canonical text.
 */
export function stableStringify(value: JsonValue): string {
  return write(value, "$");
}

function write(value: JsonValue | undefined, path: string): string {
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new InvalidSaveFormatError(
          `${path}: numbers must be safe integers and not -0, got ${String(value)}`,
          [path],
        );
      }
      return String(value);
    case "object": {
      if (value === null) {
        return "null";
      }
      if (Array.isArray(value)) {
        return `[${value.map((item, index) => write(item, `${path}[${index}]`)).join(",")}]`;
      }
      const parts: string[] = [];
      for (const key of Object.keys(value).sort()) {
        parts.push(`${JSON.stringify(key)}:${write(value[key], `${path}.${key}`)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new InvalidSaveFormatError(`${path}: ${typeof value} is not JSON`, [path]);
  }
}
