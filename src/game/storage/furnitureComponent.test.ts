import { describe, expect, it } from "vitest";
import { furnitureComponent } from "./furnitureComponent";

describe("furnitureComponent", () => {
  it("is named Furniture and defaults to a chest", () => {
    expect(furnitureComponent.name).toBe("Furniture");
    expect(furnitureComponent.defaults()).toEqual({ furnitureId: "chest" });
  });

  it("validates strictly", () => {
    expect(furnitureComponent.schema.safeParse({ furnitureId: "oak_table" }).success).toBe(true);
    expect(furnitureComponent.schema.safeParse({ furnitureId: "Oak Table" }).success).toBe(false);
    expect(furnitureComponent.schema.safeParse({ furnitureId: "a", x: 1 }).success).toBe(false);
  });
});
