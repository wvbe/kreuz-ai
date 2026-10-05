import { describe, expect, it } from "vitest";
import { positionComponent } from "./positionComponent";

describe("positionComponent", () => {
  it("is named Position and accepts a map id and cell index", () => {
    expect(positionComponent.name).toBe("Position");
    expect(positionComponent.schema.safeParse({ mapId: 2, cellIndex: 40 }).success).toBe(true);
    expect(positionComponent.schema.safeParse(positionComponent.defaults()).success).toBe(true);
  });

  it("rejects non-integers, missing ids, negative cells and unknown fields", () => {
    expect(positionComponent.schema.safeParse({ mapId: 0, cellIndex: 1 }).success).toBe(false);
    expect(positionComponent.schema.safeParse({ mapId: 1, cellIndex: -1 }).success).toBe(false);
    expect(positionComponent.schema.safeParse({ mapId: 1, cellIndex: 0.5 }).success).toBe(false);
    expect(positionComponent.schema.safeParse({ mapId: 1, cellIndex: 0, z: 1 }).success).toBe(
      false,
    );
  });
});
