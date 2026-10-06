import { describe, expect, it } from "vitest";
import { buildCellEntityIndex, pickEntity } from "./entityPicking";

const wall = { id: 1, prototype: "wall", cell: 5, components: ["Position"] };
const chest = { id: 2, prototype: "chest", cell: 5, components: ["Furniture", "Position"] };
const farmer = { id: 9, prototype: "farmer", cell: 5, components: ["Citizen", "Needs"] };
const baker = { id: 4, prototype: "baker", cell: 5, components: ["Citizen", "Needs"] };

describe("entity picking", () => {
  // @covers 024:FR-005
  it("prefers citizens over furniture over walls, lowest id among equals", () => {
    const index = buildCellEntityIndex([wall, chest, farmer, baker]);
    expect(pickEntity(index, 5)?.id).toBe(4);
    expect(pickEntity(buildCellEntityIndex([wall, chest]), 5)?.id).toBe(2);
    expect(pickEntity(buildCellEntityIndex([wall]), 5)?.id).toBe(1);
  });

  it("returns null for an empty cell", () => {
    expect(pickEntity(buildCellEntityIndex([wall]), 6)).toBeNull();
    expect(pickEntity(buildCellEntityIndex([]), 0)).toBeNull();
  });
});
