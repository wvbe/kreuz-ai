import { describe, expect, it } from "vitest";
import { squareScene } from "../testing/testScenes";
import { VisualKind } from "./entityVisuals";
import { layoutCrops, layoutEntities } from "./instanceLayout";

const scene = squareScene(10, 10);

function citizen(id: number, cell: number) {
  return { id, prototype: "farmer", cell, components: ["Citizen", "Needs", "Position"] };
}

describe("layoutEntities", () => {
  it("groups by kind and places at the cell centre", () => {
    const layout = layoutEntities(
      [citizen(3, 12), { id: 4, prototype: "wall", cell: 13, components: ["Position"] }],
      scene,
      null,
    );
    expect(layout.get(VisualKind.Citizen)?.[0]).toMatchObject({ entityId: 3, x: 2.5, z: 1.5 });
    expect(layout.get(VisualKind.Wall)?.[0]).toMatchObject({ entityId: 4, x: 3.5, z: 1.5 });
  });

  // @covers 024:FR-016
  it("marks a door open while a mobile entity stands in it", () => {
    const doorRow = (id: number, cell: number) => ({
      id,
      prototype: "door",
      cell,
      components: ["Position"],
    });
    const layout = layoutEntities([doorRow(1, 4), doorRow(2, 5), citizen(3, 5)], scene, null);
    expect((layout.get(VisualKind.Door) ?? []).map((instance) => instance.open)).toEqual([
      false,
      true,
    ]);
    expect(layout.get(VisualKind.Citizen)?.[0]?.open).toBe(false);
  });

  it("fans citizens that share a cell but never walls", () => {
    const layout = layoutEntities([citizen(1, 5), citizen(2, 5), citizen(3, 5)], scene, null);
    const people = layout.get(VisualKind.Citizen) ?? [];
    expect(people).toHaveLength(3);
    expect(people[0]).toMatchObject({ x: 5.5, z: 0.5 });
    expect(people[1]?.x).not.toBe(5.5);
    expect(new Set(people.map((person) => `${person.x}:${person.z}`)).size).toBe(3);
  });

  it("culls what lies outside the visible ground and ignores unknown cells", () => {
    const layout = layoutEntities([citizen(1, 0), citizen(2, 99), citizen(3, 1000)], scene, {
      minX: 0,
      maxX: 3,
      minZ: 0,
      maxZ: 3,
    });
    expect((layout.get(VisualKind.Citizen) ?? []).map((person) => person.entityId)).toEqual([1]);
  });

  it("is deterministic", () => {
    const entities = [citizen(1, 5), citizen(2, 5), citizen(9, 40)];
    expect(layoutEntities(entities, scene, null)).toEqual(layoutEntities(entities, scene, null));
  });
});

describe("layoutCrops", () => {
  it("draws sown and ripe cells with growth-dependent height", () => {
    const plants = layoutCrops(
      [
        { cellIndex: 1, stage: "Sown", growthPermille: 0 },
        { cellIndex: 2, stage: "Ripe", growthPermille: 1000 },
        { cellIndex: 3, stage: "Fallow", growthPermille: 0 },
        { cellIndex: 500, stage: "Ripe", growthPermille: 1000 },
      ],
      scene,
      null,
    );
    expect(plants).toHaveLength(2);
    expect(plants[1]?.height).toBeGreaterThan(plants[0]?.height ?? 0);
    expect(plants[0]?.color).not.toBe(plants[1]?.color);
  });

  it("culls plants outside the bounds", () => {
    const plants = layoutCrops([{ cellIndex: 99, stage: "Ripe", growthPermille: 1000 }], scene, {
      minX: 0,
      maxX: 2,
      minZ: 0,
      maxZ: 2,
    });
    expect(plants).toEqual([]);
  });
});
