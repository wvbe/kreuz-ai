import { needsComponent } from "../ai/needs/needsComponent";
import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import type { ContentRegistries } from "../content/ContentRegistries";
import type { Entity } from "../ecs/Entity";
import { getComponent } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { createZoneWorld } from "../zones/testZoneWorld";
import type { ZoneTestWorld } from "../zones/testZoneWorld";
import { productionOrdersComponent } from "./productionOrdersComponent";
import type { WorkstationData } from "./productionTypes";

/**
 * One `production.*` event seen by the test world.
 */
export type SeenProductionEvent = {
  tick: number;
  name: string;
  payload: JsonValue;
};

/**
 * A zone test world (square map, board at cell 0, every tier unlocked) plus production helpers.
 */
export type ProductionTestWorld = ZoneTestWorld & {
  /**
   * Spawns a workstation by its prototype id (`oven`, `grinding_mill`, `sawmill`, `workbench`).
   */
  station: (prototypeId: string, cell: number) => Entity;
  /**
   * Spawns a peasant on a cell (an ordinary citizen with the default behavior tree).
   */
  settler: (cell: number) => Entity;
  /**
   * Tops up the needs of citizens so that hunger never interferes with a production test.
   */
  feed: (citizens: Entity[]) => void;
  /**
   * Runs `CreateProductionOrder` at once; returns the order id.
   */
  order: (payload: { [field: string]: JsonValue }) => number;
  /**
   * The live `ProductionOrders` data of a workstation.
   */
  data: (station: Entity) => WorkstationData;
  /**
   * Every `production.*` event seen so far (the zone events stay in `events`).
   */
  seen: SeenProductionEvent[];
};

/**
 * The bundled content pack plus extra recipes (raw JSON records of `recipes.json`), for tests of
 * restrictions the shipped recipes do not use (tools, skill levels, byproducts).
 *
 * @param extraRecipes - Recipe records to append.
 * @returns Fresh registries.
 */
export function contentWithRecipes(extraRecipes: JsonValue[]): ContentRegistries {
  const recipes = bundledContentFiles[ContentFile.Recipes];
  return loadContentPack({
    ...bundledContentFiles,
    [ContentFile.Recipes]: [...(Array.isArray(recipes) ? recipes : []), ...extraRecipes],
  });
}

/**
 * Builds a {@link ProductionTestWorld}.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createProductionWorld(options: JobTestWorldOptions = {}): ProductionTestWorld {
  const world = createZoneWorld(options);
  const seen: SeenProductionEvent[] = [];
  world.engine.bus.subscribe("production.**", (payload, event) => {
    seen.push({ tick: world.engine.time.tickCount, name: event.name, payload });
  });
  return {
    ...world,
    seen,
    station: (prototypeId, cell) => world.spawn(prototypeId, cell),
    settler: (cell) => world.spawn("peasant", cell),
    feed: (citizens) => {
      for (const citizen of citizens) {
        for (const entry of getComponent(citizen, needsComponent)?.values ?? []) {
          entry.valueMilli = 80_000;
        }
      }
    },
    order: (payload) => {
      const result = world.command("CreateProductionOrder", payload);
      return (result as { orderId: number }).orderId;
    },
    data: (station) => {
      const data = getComponent(station, productionOrdersComponent);
      if (data === undefined) {
        throw new Error(`entity ${station.id} is no workstation`);
      }
      return data;
    },
  };
}
