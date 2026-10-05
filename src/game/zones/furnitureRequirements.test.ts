import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import {
  checkRequirement,
  compileRequirements,
  countMatching,
  formatRequirement,
  parseFurnitureRequirements,
  requiredPieces,
} from "./furnitureRequirements";
import type { FurniturePiece } from "./furnitureRequirements";
import { ZoneError, ZoneErrorKind } from "./ZoneError";
import type { FurnitureAlternative } from "./zoneTypes";

const bed: FurniturePiece = { furnitureId: "wooden_bed", tags: ["bed"] };
const chest: FurniturePiece = { furnitureId: "chest", tags: ["storage"] };
const crate: FurniturePiece = { furnitureId: "crate", tags: ["storage"] };

function alt(
  match: FurnitureAlternative["match"],
  count = 1,
  perTiles: number | null = null,
): FurnitureAlternative {
  return { match, count, perTiles };
}

describe("parseFurnitureRequirements", () => {
  const valid: [string, ReturnType<typeof parseFurnitureRequirements>][] = [
    ["any bed", [{ alternatives: [alt({ tag: "bed" })] }]],
    ["tag:bed", [{ alternatives: [alt({ tag: "bed" })] }]],
    ["id:table", [{ alternatives: [alt({ id: "table" })] }]],
    ["3x tag:bed", [{ alternatives: [alt({ tag: "bed" }, 3)] }]],
    [
      "2x id:crate or 2x id:chest",
      [{ alternatives: [alt({ id: "crate" }, 2), alt({ id: "chest" }, 2)] }],
    ],
    [
      "any oven and 1x id:table or any bench",
      [
        { alternatives: [alt({ tag: "oven" })] },
        { alternatives: [alt({ id: "table" }), alt({ tag: "bench" })] },
      ],
    ],
    ["1x tag:bed per 8 tiles", [{ alternatives: [alt({ tag: "bed" }, 1, 8)] }]],
    ["  any   bed  ", [{ alternatives: [alt({ tag: "bed" })] }]],
  ];
  it.each(valid)("reads %j", (text, expected) => {
    expect(parseFurnitureRequirements(text)).toEqual(expected);
  });

  const invalid = [
    "",
    "   ",
    "bed",
    "any",
    "any bed or",
    "or any bed",
    "any bed and",
    "any bed or or any chair",
    "0x tag:bed",
    "x tag:bed",
    "2 x tag:bed",
    "tag:Bed",
    "id:",
    "tag:bed per tiles",
    "tag:bed per 0 tiles",
    "tag:bed per 4 tile",
    "tag:bed per 4 tiles extra",
    "any big bed",
  ];
  it.each(invalid)("rejects %j", (text) => {
    expect(() => parseFurnitureRequirements(text)).toThrow(ZoneError);
    try {
      parseFurnitureRequirements(text);
    } catch (failure) {
      expect((failure as ZoneError).kind).toBe(ZoneErrorKind.InvalidRequirement);
    }
  });
});

describe("formatRequirement", () => {
  it("writes the explicit form that parses back to the same predicate", () => {
    for (const text of ["2x tag:bed or 1x id:chest", "1x tag:bed per 8 tiles", "1x id:table"]) {
      const parsed = parseFurnitureRequirements(text);
      expect(parsed.map(formatRequirement).join(" and ")).toBe(text);
    }
  });
});

describe("compileRequirements", () => {
  it("turns the authored zone types into typed predicates", () => {
    const content = loadContent();
    const bakery = content.zones.require("bakery");
    expect(compileRequirements(bakery)).toEqual([{ alternatives: [alt({ tag: "oven" })] }]);
    expect(compileRequirements(content.zones.require("throne_room"))).toEqual([
      { alternatives: [alt({ id: "table" })] },
    ]);
    expect(compileRequirements(content.zones.require("stockpile"))).toEqual([]);
  });
});

describe("requiredPieces", () => {
  it("is the flat count, or the count per started group of tiles for a density", () => {
    expect(requiredPieces(alt({ tag: "bed" }, 2), 40)).toBe(2);
    expect(requiredPieces(alt({ tag: "bed" }, 1, 8), 8)).toBe(1);
    expect(requiredPieces(alt({ tag: "bed" }, 1, 8), 9)).toBe(2);
    expect(requiredPieces(alt({ tag: "bed" }, 2, 8), 17)).toBe(6);
    expect(requiredPieces(alt({ tag: "bed" }, 1, 8), 1)).toBe(1);
  });
});

describe("countMatching", () => {
  it("matches by tag or by id", () => {
    const pieces = [bed, chest, crate];
    expect(countMatching(alt({ tag: "storage" }), pieces)).toBe(2);
    expect(countMatching(alt({ id: "chest" }), pieces)).toBe(1);
    expect(countMatching(alt({ tag: "oven" }), pieces)).toBe(0);
  });
});

describe("checkRequirement", () => {
  const storage = parseFurnitureRequirements("2x id:crate or 2x id:chest")[0];

  it("is met when any alternative has enough pieces", () => {
    expect(storage).toBeDefined();
    if (storage === undefined) {
      return;
    }
    expect(checkRequirement(storage, 4, [crate, crate]).met).toBe(true);
    expect(checkRequirement(storage, 4, [chest, chest, bed]).met).toBe(true);
    expect(checkRequirement(storage, 4, [chest, crate]).met).toBe(false);
  });

  it("reports the closest alternative of an unmet requirement", () => {
    if (storage === undefined) {
      return;
    }
    expect(checkRequirement(storage, 4, [chest])).toEqual({ met: false, required: 2, present: 1 });
    expect(checkRequirement(storage, 4, [])).toEqual({ met: false, required: 2, present: 0 });
  });

  it("scales a density with the zone size", () => {
    const density = parseFurnitureRequirements("1x tag:bed per 4 tiles")[0];
    if (density === undefined) {
      return;
    }
    expect(checkRequirement(density, 8, [bed]).met).toBe(false);
    expect(checkRequirement(density, 8, [bed, bed]).met).toBe(true);
    expect(checkRequirement(density, 4, [bed]).met).toBe(true);
  });
});
