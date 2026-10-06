import { describe, expect, it } from "vitest";
import { BlockReason } from "../map/mapTypes";
import { findArrivalCell } from "./arrivalCell";
import { createHousingWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

describe("findArrivalCell", () => {
  it("has no cell without a seat of government", () => {
    const world = createHousingWorld(options);
    expect(findArrivalCell(world.engine)).toEqual({
      cell: null,
      blocked: "NoSeatOfGovernment",
    });
  });

  it("picks the border cell that costs least from the throne room, lowest index on ties", () => {
    const world = createHousingWorld(options);
    // Throne room tiles x 5..7, y 5..7: the nearest border is the left or the right column of its row
    // band (cost 6 each way) or the top and bottom rows (cost 6 / 5).
    world.throneRoom(5, 5);
    const arrival = findArrivalCell(world.engine);
    expect(arrival.blocked).toBeNull();
    const cell = arrival.cell;
    expect(cell?.mapId).toBe(world.mapId);
    const column = (cell?.cellIndex ?? 0) % 16;
    const row = Math.floor((cell?.cellIndex ?? 0) / 16);
    expect(column === 0 || row === 0 || column === 15 || row === 11).toBe(true);
    // The door is on the top side (row 4): the shortest way out leads to the top border.
    expect(row).toBe(0);
  });

  it("is blocked when no border cell can be reached", () => {
    const world = createHousingWorld(options);
    world.throneRoom(5, 5);
    const map = world.engine.maps.require(world.mapId);
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      const column = cell % 16;
      const row = Math.floor(cell / 16);
      if (column === 0 || row === 0 || column === 15 || row === 11) {
        map.setObstruction(cell, BlockReason.Wall);
      }
    }
    expect(findArrivalCell(world.engine)).toEqual({ cell: null, blocked: "NoArrivalCell" });
  });
});
