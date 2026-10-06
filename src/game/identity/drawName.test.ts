import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { NameListContent } from "../content/schemas/characterSchemas";
import { Prng } from "../engine/Prng";
import { drawName, ordinalFor } from "./drawName";
import { fullName } from "./nameText";

const common = loadContent().nameLists.require("common_13c");

function stream(seed: number) {
  return Prng.create({ seed }).stream("identity.names");
}

describe("drawName", () => {
  it("draws names of the list and is deterministic per stream", () => {
    const draw = (seed: number) => {
      const source = stream(seed);
      return Array.from({ length: 20 }, () =>
        drawName({
          list: common,
          stream: source,
          bynameChancePermille: 850,
          redrawLimit: 8,
          taken: [],
        }),
      );
    };
    expect(draw(5)).toEqual(draw(5));
    expect(draw(5)).not.toEqual(draw(6));
    for (const name of draw(5)) {
      expect(common.givenNames.map((entry) => entry.name)).toContain(name.givenName);
      expect(name.byname === null || common.bynames.includes(name.byname)).toBe(true);
      expect(name.nameOrdinal).toBe(0);
    }
  });

  // @covers 028:FR-004
  it("gives a byname with the stated probability", () => {
    const none = drawName({
      list: common,
      stream: stream(1),
      bynameChancePermille: 0,
      redrawLimit: 8,
      taken: [],
    });
    const always = drawName({
      list: common,
      stream: stream(1),
      bynameChancePermille: 1000,
      redrawLimit: 8,
      taken: [],
    });
    expect(none.byname).toBeNull();
    expect(always.byname).not.toBeNull();
  });

  // @covers 028:FR-004
  it("redraws on a collision and keeps the last draw with the lowest free ordinal", () => {
    const single: NameListContent = {
      id: "single",
      givenNames: [{ name: "Ansel", weight: 1 }],
      bynames: ["Brook"],
    };
    const options = { list: single, bynameChancePermille: 1000, redrawLimit: 3 };
    const first = drawName({
      ...options,
      stream: stream(1),
      taken: [],
    });
    expect(first).toEqual({ givenName: "Ansel", byname: "Brook", nameOrdinal: 0 });
    const second = drawName({
      ...options,
      stream: stream(1),
      taken: [first],
    });
    expect(second).toEqual({ givenName: "Ansel", byname: "Brook", nameOrdinal: 2 });
    const third = drawName({
      ...options,
      stream: stream(1),
      taken: [first, second],
    });
    expect(third.nameOrdinal).toBe(3);
  });

  it("redraws a colliding first draw into a free name without ordinal", () => {
    const source = stream(9);
    const probe = stream(9);
    const firstDraw = drawName({
      list: common,
      stream: probe,
      bynameChancePermille: 850,
      redrawLimit: 8,
      taken: [],
    });
    const redrawn = drawName({
      list: common,
      stream: source,
      bynameChancePermille: 850,
      redrawLimit: 8,
      taken: [firstDraw],
    });
    expect(fullName(redrawn.givenName, redrawn.byname)).not.toBe(
      fullName(firstDraw.givenName, firstDraw.byname),
    );
    expect(redrawn.nameOrdinal).toBe(0);
  });
});

describe("ordinalFor", () => {
  it("is 0 for a free name and the lowest free ordinal otherwise", () => {
    const taken = [
      { givenName: "Ansel", byname: "Brook", nameOrdinal: 0 },
      { givenName: "Ansel", byname: "Brook", nameOrdinal: 2 },
      { givenName: "Odo", byname: null, nameOrdinal: 0 },
    ];
    expect(ordinalFor("Hugh", null, taken)).toBe(0);
    expect(ordinalFor("ansel", "brook", taken)).toBe(3);
    expect(ordinalFor("Odo", null, taken)).toBe(2);
    expect(ordinalFor("Odo", "Brook", taken)).toBe(0);
  });
});
