import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { reachCostsOf } from "../jobs/claimJob";
import type { GameMap } from "../map/GameMap";
import { positionComponent } from "../map/positionComponent";

/**
 * Per-pass helpers for providers. A context lives for one pass (one tick or one query) and is
 * never stored.
 */
export type StatusContext = {
  /**
   * Cheapest path costs from the citizen's cell to every cell it can reach (null without a
   * position). Computed once per start cell and map state, see {@link createStatusContext}.
   */
  reachCosts: (citizen: Entity) => Map<number, number> | null;
  /**
   * Every live entity with a `Citizen` component in entity order, listed once per pass.
   */
  citizens: () => Entity[];
};

type ReachEntry = {
  map: GameMap;
  revision: number;
  costs: Map<number, number>;
};

const maxReachEntries = 256;

const reachCaches = new WeakMap<GameEngine, Map<string, ReachEntry>>();

/**
 * Creates the context of one evaluation pass. The reach costs behind `reachCosts` are a derived
 * cache per engine (never saved, never changes a result): an entry is used only while the map
 * object and its `revision` are unchanged, like the path cache of spec 012, so idle citizens that
 * stand still cost one search, not one per tick. At most 256 start cells are kept.
 *
 * @param engine - The engine.
 * @returns A fresh context.
 */
export function createStatusContext(engine: GameEngine): StatusContext {
  let cache = reachCaches.get(engine);
  if (cache === undefined) {
    cache = new Map();
    reachCaches.set(engine, cache);
  }
  const entries = cache;
  let citizens: Entity[] | null = null;
  return {
    citizens: () => {
      citizens ??= engine.store
        .entities()
        .filter(
          (entity) =>
            hasComponent(entity, citizenComponent) && !engine.store.isPendingDelete(entity.id),
        );
      return citizens;
    },
    reachCosts: (citizen) => {
      const place = getComponent(citizen, positionComponent);
      const map = place === undefined ? undefined : engine.maps.get(place.mapId);
      if (place === undefined || map === undefined) {
        return null;
      }
      const key = `${place.mapId}:${place.cellIndex}`;
      const hit = entries.get(key);
      if (hit !== undefined && hit.map === map && hit.revision === map.revision) {
        return hit.costs;
      }
      const costs = reachCostsOf(engine, citizen);
      if (costs === null) {
        return null;
      }
      if (entries.size >= maxReachEntries) {
        const oldest = entries.keys().next();
        if (oldest.done !== true) {
          entries.delete(oldest.value);
        }
      }
      entries.delete(key);
      entries.set(key, { map, revision: map.revision, costs });
      return costs;
    },
  };
}
