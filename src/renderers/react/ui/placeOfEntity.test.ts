import { describe, expect, it } from "vitest";
import { placeOfEntity } from "./placeOfEntity";

describe("placeOfEntity", () => {
  it("reads the position of an entity", () => {
    expect(
      placeOfEntity({
        ok: true,
        data: { id: 1, components: { Position: { mapId: 2, cellIndex: 30 } } },
      }),
    ).toEqual({ mapId: 2, cell: 30 });
  });

  it("uses the first tile of a zone", () => {
    expect(
      placeOfEntity({
        ok: true,
        data: { id: 1, components: { Zone: { mapId: 1, tiles: [7, 8] } } },
      }),
    ).toEqual({ mapId: 1, cell: 7 });
  });

  it("is null for no entity, no place or a failed query", () => {
    expect(placeOfEntity({ ok: true, data: null })).toBeNull();
    expect(placeOfEntity({ ok: true, data: { id: 1, components: {} } })).toBeNull();
    expect(
      placeOfEntity({ ok: false, error: { kind: "no-game", message: "none" } } as never),
    ).toBeNull();
  });
});
