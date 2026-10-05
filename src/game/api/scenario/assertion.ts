import type { JsonValue } from "../../engine/EventBus";

/**
 * Comparison operators of a scenario assertion.
 */
export enum AssertOp {
  Eq = "eq",
  Gt = "gt",
  Gte = "gte",
  Lt = "lt",
  Lte = "lte",
  Exists = "exists",
  Includes = "includes",
}

/**
 * Outcome of resolving a path in a JSON value.
 */
export type PathLookup = { found: false } | { found: true; value: JsonValue };

/**
 * Resolves a dotted path (`time.tick`, `entities.0.id`, `entities.length`) in a JSON value.
 * Object keys and array indices are plain segments; `length` of an array or string is its size.
 * The empty path is the value itself.
 *
 * @param data - The value to look into.
 * @param path - Dot-separated segments.
 * @returns The value, or `{found:false}` when any segment does not resolve.
 */
export function getPathValue(data: JsonValue, path: string): PathLookup {
  let current: JsonValue = data;
  const segments = path === "" ? [] : path.split(".");
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (segment === "length") {
        current = current.length;
        continue;
      }
      const index = Number(segment);
      const item = Number.isInteger(index) && index >= 0 ? current[index] : undefined;
      if (item === undefined) {
        return { found: false };
      }
      current = item;
    } else if (typeof current === "string" && segment === "length") {
      current = current.length;
    } else if (typeof current === "object" && current !== null) {
      const record: { [key: string]: JsonValue } = current;
      const child = Object.hasOwn(record, segment) ? record[segment] : undefined;
      if (child === undefined) {
        return { found: false };
      }
      current = child;
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}

/**
 * Structural equality of two JSON values; object key order does not matter.
 *
 * @param left - First value.
 * @param right - Second value.
 * @returns True when both are the same JSON.
 */
export function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => {
        const other = right[index];
        return other !== undefined && jsonEquals(item, other);
      })
    );
  }
  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => {
        const leftChild = left[key];
        const rightChild = right[key];
        return (
          key === rightKeys[index] &&
          leftChild !== undefined &&
          rightChild !== undefined &&
          jsonEquals(leftChild, rightChild)
        );
      })
    );
  }
  return left === right;
}

/**
 * Applies a comparison operator.
 *
 * @param operator - The operator.
 * @param lookup - What the path resolved to.
 * @param expected - The expected value (ignored by `exists`).
 * @returns True when the assertion holds. Ordering operators hold only for two numbers.
 */
export function evaluateAssertion(
  operator: AssertOp,
  lookup: PathLookup,
  expected: JsonValue | undefined,
): boolean {
  if (operator === AssertOp.Exists) {
    return lookup.found && lookup.value !== null;
  }
  if (!lookup.found || expected === undefined) {
    return false;
  }
  const actual = lookup.value;
  switch (operator) {
    case AssertOp.Eq:
      return jsonEquals(actual, expected);
    case AssertOp.Includes:
      if (Array.isArray(actual)) {
        return actual.some((item) => jsonEquals(item, expected));
      }
      if (typeof actual === "string") {
        return typeof expected === "string" && actual.includes(expected);
      }
      return (
        typeof actual === "object" &&
        actual !== null &&
        typeof expected === "string" &&
        Object.hasOwn(actual, expected)
      );
    default:
      if (typeof actual !== "number" || typeof expected !== "number") {
        return false;
      }
      if (operator === AssertOp.Gt) {
        return actual > expected;
      }
      if (operator === AssertOp.Gte) {
        return actual >= expected;
      }
      return operator === AssertOp.Lt ? actual < expected : actual <= expected;
  }
}
