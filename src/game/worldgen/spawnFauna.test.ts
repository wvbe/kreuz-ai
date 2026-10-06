import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { Entity } from "../ecs/Entity";
import { GameEngine } from "../engine/GameEngine";
import { MapSize } from "../map/mapSize";
import { positionComponent } from "../map/positionComponent";
import { getComponent } from "../ecs/Entity";
import { baseTerrainOf } from "./placeFeatures";
import { cellSpacing } from "./generateOutdoorTerrain";
import { distanceSquared } from "./distanceSquared";
import { readWorldLayout } from "./readWorldLayout";
import {
  faunaSafeSpacings,
  guaranteedThreatLevel,
  habitatCellsPerAnimal,
  maxAnimalsPerSpecies,
  spawnFauna,
} from "./spawnFauna";

function newGame(seed: number): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed, mapSize: MapSize.Small });
  return engine;
}

function animalsOf(engine: GameEngine): Entity[] {
  return engine.store.entities().filter((entity) => entity.components["Animal"] !== undefined);
}

describe("spawnFauna", () => {
  it("places wild animals in a seed-42 Small world, after everything else", () => {
    const engine = newGame(42);
    const animals = animalsOf(engine);
    expect(animals.length).toBeGreaterThanOrEqual(3);
    const others = engine.store.entities().filter((entity) => !animals.includes(entity));
    const lastOther = Math.max(...others.map((entity) => entity.id));
    expect(Math.min(...animals.map((entity) => entity.id))).toBeGreaterThan(lastOther);
    expect(animals.map((entity) => entity.components["Animal"]?.["kind"])).toEqual(
      animals.map(() => "wild"),
    );
  });

  it("is a pure function of the seed", () => {
    const describeWorld = (engine: GameEngine): string[] =>
      animalsOf(engine).map(
        (entity) => `${entity.prototype}@${String(entity.components["Position"]?.["cellIndex"])}`,
      );
    expect(describeWorld(newGame(42))).toEqual(describeWorld(newGame(42)));
    expect(describeWorld(newGame(42))).not.toEqual(describeWorld(newGame(43)));
  });

  it("puts every animal on a traversable habitat cell of its species, away from the village", () => {
    const engine = newGame(42);
    const layout = readWorldLayout(engine);
    if (layout === null || layout.villageCell === null) {
      throw new Error("no world");
    }
    const map = engine.maps.require(layout.mapId);
    const origin = map.centroid(layout.villageCell);
    const spacing = cellSpacing(map.cellCount);
    const seen = new Set<number>();
    for (const entity of animalsOf(engine)) {
      const position = getComponent(entity, positionComponent);
      const record = engine.content.animals.require(entity.prototype);
      expect(position).toBeDefined();
      const cell = position?.cellIndex ?? -1;
      expect(map.isTraversable(cell)).toBe(true);
      expect(record.habitatTerrainIds).toContain(baseTerrainOf(map.terrainAt(cell)));
      expect(distanceSquared(map.centroid(cell), origin)).toBeGreaterThanOrEqual(
        faunaSafeSpacings * faunaSafeSpacings * spacing * spacing,
      );
      expect(seen.has(cell)).toBe(false);
      seen.add(cell);
    }
  });

  it("keeps the counts within the caps of the threat levels and spawns no livestock", () => {
    const engine = newGame(42);
    const counts = new Map<string, number>();
    for (const entity of animalsOf(engine)) {
      counts.set(entity.prototype, (counts.get(entity.prototype) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      const record = engine.content.animals.require(id);
      expect(record.kind).toBe("wild");
      expect(count).toBeLessThanOrEqual(maxAnimalsPerSpecies[record.threatLevel] as number);
    }
    expect(counts.has("deer") || counts.has("rabbit") || counts.has("fox")).toBe(true);
    expect(habitatCellsPerAnimal).toHaveLength(maxAnimalsPerSpecies.length);
    expect(guaranteedThreatLevel).toBeLessThan(maxAnimalsPerSpecies.length);
  });

  it("follows the terrain: on a map of grassland only rabbits and foxes find a home", () => {
    const engine = newGame(42);
    const before = animalsOf(engine).length;
    const layout = readWorldLayout(engine);
    if (layout === null || layout.villageCell === null) {
      throw new Error("no world");
    }
    const map = engine.maps.require(layout.mapId);
    map.assignTerrain(Array.from({ length: map.cellCount }, () => "grassland"));
    const added = spawnFauna(engine, layout.mapId, layout.villageCell);
    expect(animalsOf(engine)).toHaveLength(before + added.length);
    expect(added.length).toBeGreaterThan(0);
    for (const id of added) {
      expect(["rabbit", "fox"]).toContain(engine.store.require(id).prototype);
    }
  });
});
