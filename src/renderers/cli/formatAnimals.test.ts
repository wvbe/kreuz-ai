import { describe, expect, it } from "vitest";
import { formatAnimals } from "./formatAnimals";

const deer = {
  entityId: 19,
  prototypeId: "deer",
  kind: "wild",
  mapId: 1,
  cellIndex: 250,
  hungerMilli: 12_400,
  healthMilli: 100_000,
  held: [],
  action: "stand around",
};

describe("formatAnimals", () => {
  it("prints a summary and a line per animal", () => {
    expect(
      formatAnimals({
        animals: [
          deer,
          {
            ...deer,
            entityId: 20,
            prototypeId: "cow",
            kind: "livestock",
            held: [{ materialId: "milk", quantity: 3 }],
            action: "idle",
          },
        ],
      }),
    ).toEqual([
      "2 animals: 1 wild, 1 livestock",
      "  #19 deer (wild) at 1:250, health 100%, hunger 12%: stand around",
      "  #20 cow (livestock) at 1:250, health 100%, hunger 12%, holds 3 milk: idle",
    ]);
  });

  it("says when there are no animals and ignores foreign data", () => {
    expect(formatAnimals({ animals: [] })).toEqual(["no animals"]);
    expect(formatAnimals("x")).toEqual([]);
    expect(formatAnimals({ animals: [{ ...deer, mapId: null, cellIndex: null }] })[1]).toContain(
      "off the map",
    );
  });
});
