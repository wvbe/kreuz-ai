import type { Entity } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { createProductionWorld } from "../production/testProductionWorld";
import type { ProductionTestWorld } from "../production/testProductionWorld";
import { findSite } from "./buildSiteQueries";
import type { SiteRef } from "./buildSiteQueries";

/**
 * One `construction.*` event seen by the test world.
 */
export type SeenConstructionEvent = {
  tick: number;
  name: string;
  payload: JsonValue;
};

/**
 * A production test world (square map, board at cell 0, every tier unlocked) plus construction
 * helpers.
 */
export type ConstructionTestWorld = ProductionTestWorld & {
  /**
   * Runs `QueueConstruction` at once; returns the job id (the site entity id).
   */
  place: (prototypeId: string, cell: number, extra?: { [field: string]: JsonValue }) => number;
  /**
   * The live site of a job; throws when it is gone.
   */
  site: (jobId: number) => SiteRef;
  /**
   * Whether the job still has a live site.
   */
  hasSite: (jobId: number) => boolean;
  /**
   * Gives a chest the materials of a build definition (times `times`).
   */
  stockFor: (chest: Entity, prototypeId: string, times?: number) => void;
  /**
   * Runs ticks until a condition holds (at most `limit`); returns the ticks run.
   */
  runUntil: (done: () => boolean, limit: number) => number;
  /**
   * Every `construction.*` event seen so far.
   */
  built: SeenConstructionEvent[];
};

/**
 * Builds a {@link ConstructionTestWorld}.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createConstructionWorld(options: JobTestWorldOptions = {}): ConstructionTestWorld {
  const world = createProductionWorld(options);
  const built: SeenConstructionEvent[] = [];
  world.engine.bus.subscribe("construction.**", (payload, event) => {
    built.push({ tick: world.engine.time.tickCount, name: event.name, payload });
  });
  const site = (jobId: number): SiteRef => {
    const found = findSite(world.engine, jobId);
    if (found === null) {
      throw new Error(`construction job ${jobId} has no live site`);
    }
    return found;
  };
  return {
    ...world,
    built,
    site,
    hasSite: (jobId) => findSite(world.engine, jobId) !== null,
    place: (prototypeId, cell, extra = {}) => {
      const result = world.command("QueueConstruction", {
        prototypeId,
        mapId: world.mapId,
        cellIndex: cell,
        ...extra,
      });
      return (result as { jobId: number }).jobId;
    },
    stockFor: (chest, prototypeId, times = 1) => {
      const definition = world.engine.content.furniture.require(prototypeId);
      for (const item of definition.constructionMaterials) {
        world.give(chest, item.materialId, item.quantity * times);
      }
    },
    runUntil: (done, limit) => {
      let ticks = 0;
      while (ticks < limit && !done()) {
        world.run(1);
        ticks += 1;
      }
      return ticks;
    },
  };
}
