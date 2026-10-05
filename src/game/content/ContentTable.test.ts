import { describe, expect, it } from "vitest";
import { ContentTable, deepFreeze, UnknownContentError } from "./ContentTable";

type Row = { id: string; tags: string[] };

function table(): ContentTable<Row> {
  return new ContentTable(
    "rows",
    [
      { id: "zeta", tags: ["a"] },
      { id: "alpha", tags: [] },
    ],
    (row) => row.id,
  );
}

describe("ContentTable", () => {
  it("looks records up, keeps file order and sorts ids", () => {
    const rows = table();
    expect(rows.size).toBe(2);
    expect(rows.has("alpha")).toBe(true);
    expect(rows.has("beta")).toBe(false);
    expect(rows.find("beta")).toBeUndefined();
    expect(rows.require("zeta").tags).toEqual(["a"]);
    expect(rows.all().map((row) => row.id)).toEqual(["zeta", "alpha"]);
    expect(rows.ids()).toEqual(["alpha", "zeta"]);
  });

  it("throws UnknownContentError for a missing key", () => {
    expect(() => table().require("beta")).toThrow(UnknownContentError);
    expect(() => table().require("beta")).toThrow('unknown rows entry "beta"');
  });

  it("freezes its records deeply", () => {
    const row = table().require("zeta");
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row.tags)).toBe(true);
  });
});

describe("deepFreeze", () => {
  it("freezes nested objects and passes primitives through", () => {
    const value = deepFreeze({ list: [{ id: 1 }] });
    expect(Object.isFrozen(value.list[0])).toBe(true);
    expect(deepFreeze(5)).toBe(5);
    expect(deepFreeze(null)).toBeNull();
  });
});

describe("UnknownContentError", () => {
  it("carries table and key", () => {
    const error = new UnknownContentError("skills", "x");
    expect(error.table).toBe("skills");
    expect(error.key).toBe("x");
    expect(error.name).toBe("UnknownContentError");
  });
});
