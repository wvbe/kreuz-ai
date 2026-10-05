import { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import { EcsError, EcsErrorKind } from "./EcsError";

/**
 * Zod schema for any JSON value whose numbers are safe integers (Constitution II).
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().int(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/**
 * Tells whether a value is a plain JSON object (not null, not an array).
 *
 * @param value - Any JSON value.
 * @returns True for objects.
 */
export function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-copies a JSON value and verifies it is JSON with safe-integer numbers only.
 *
 * @param value - Value to copy.
 * @returns An independent copy; object keys keep their insertion order.
 */
export function cloneJson<Data extends JsonValue>(value: Data): Data {
  return cloneValue(value) as Data;
}

function cloneValue(value: JsonValue): JsonValue {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new EcsError(
          EcsErrorKind.NotJson,
          `numbers must be safe integers, got ${String(value)}`,
        );
      }
      return value;
    case "object": {
      if (value === null) {
        return null;
      }
      if (Array.isArray(value)) {
        return value.map((item) => cloneValue(item));
      }
      const copy: { [key: string]: JsonValue } = {};
      for (const key of Object.keys(value)) {
        copy[key] = cloneValue(value[key] as JsonValue);
      }
      return copy;
    }
    default:
      throw new EcsError(EcsErrorKind.NotJson, `value contains a non-JSON ${typeof value}`);
  }
}

/**
 * Structural equality of two JSON values; object key order does not matter.
 *
 * @param left - First value.
 * @param right - Second value.
 * @returns True when both are deeply equal.
 */
export function jsonEquals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => jsonEquals(item, right[index]))
    );
  }
  if (isJsonObject(left) && isJsonObject(right)) {
    const leftKeys = Object.keys(left);
    return (
      leftKeys.length === Object.keys(right).length &&
      leftKeys.every((key) => Object.hasOwn(right, key) && jsonEquals(left[key], right[key]))
    );
  }
  return false;
}

/**
 * Reads a nested value by key path.
 *
 * @param root - Value to start from.
 * @param segments - Object keys to follow in order.
 * @returns The value, or undefined when a segment is missing or the value is not an object.
 */
export function readJsonPath(
  root: JsonValue | undefined,
  segments: string[],
): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const segment of segments) {
    if (!isJsonObject(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}
