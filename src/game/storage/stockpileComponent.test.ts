import { describe, expect, it } from "vitest";
import {
  materialFilterSchema,
  stockpileComponent,
  stockpileDataSchema,
} from "./stockpileComponent";

// @covers 018:FR-003 018:FR-014
describe("stockpileComponent", () => {
  it("defaults to priority 50 and no filter", () => {
    expect(stockpileComponent.name).toBe("Stockpile");
    expect(stockpileComponent.defaults()).toEqual({ priority: 50, filter: null });
  });

  it("round trips JSON", () => {
    const data = { priority: 80, filter: { categories: ["food"], materialIds: ["iron_ingot"] } };
    expect(stockpileDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects priorities out of range, unknown fields and bad ids", () => {
    expect(stockpileDataSchema.safeParse({ priority: 101, filter: null }).success).toBe(false);
    expect(stockpileDataSchema.safeParse({ priority: -1, filter: null }).success).toBe(false);
    expect(stockpileDataSchema.safeParse({ priority: 5, filter: null, extra: 1 }).success).toBe(
      false,
    );
    expect(materialFilterSchema.safeParse({ categories: ["Food"], materialIds: [] }).success).toBe(
      false,
    );
    expect(materialFilterSchema.safeParse({ categories: [] }).success).toBe(false);
  });
});
