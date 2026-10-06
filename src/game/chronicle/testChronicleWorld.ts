import { loadContent } from "../content/ContentLoader";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import { GameEngine } from "../engine/GameEngine";
import { joinFaction } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { assignIdentity } from "../identity/assignIdentity";
import { identityComponent } from "../identity/identityComponent";
import type { IdentityData } from "../identity/identityTypes";
import { skillsComponent } from "../skills/skillsComponent";
import { chronicleOf } from "./chronicleOf";
import type { MomentRecord } from "./chronicleTypes";
import { momentRecordedEvent } from "./chronicleTypes";

/**
 * A bare game (no map) for chronicle tests: the player government, citizens that joined it and
 * were named, and every recorded moment collected from the event.
 */
export type ChronicleTestWorld = {
  engine: GameEngine;
  government: EntityId;
  /**
   * Every `chronicle.moment.recorded` payload so far.
   */
  recorded: MomentRecord[];
  /**
   * Spawns a named citizen of the government (a peasant) and drains the event queue, so that its
   * `Arrived` is recorded.
   */
  addCitizen: () => Entity;
  /**
   * The citizen's `Identity` data.
   */
  identityOf: (entityId: EntityId) => IdentityData;
  /**
   * Sets a skill to a level (milli-percent `level * 1000`) without events.
   */
  setLevel: (entityId: EntityId, skillId: string, level: number) => void;
  /**
   * Drains the event queue.
   */
  flush: () => void;
  /**
   * Moments of one kind recorded so far.
   */
  ofKind: (kind: string) => MomentRecord[];
  /**
   * The live chronicle's moments.
   */
  chronicle: () => MomentRecord[];
};

/**
 * Builds a {@link ChronicleTestWorld}.
 *
 * @param seed - Game seed (default 7).
 * @returns The world.
 */
export function createChronicleWorld(seed = 7): ChronicleTestWorld {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed });
  const government = governmentFactionId(engine) ?? 1;
  const recorded: MomentRecord[] = [];
  engine.bus.subscribe<MomentRecord>(momentRecordedEvent, (payload) => recorded.push(payload));
  const identityOf = (entityId: EntityId): IdentityData => {
    const identity = getComponent(engine.store.require(entityId), identityComponent);
    if (identity === undefined) {
      throw new Error(`entity ${entityId} has no identity`);
    }
    return identity;
  };
  return {
    engine,
    government,
    recorded,
    addCitizen: () => {
      const entity = engine.store.spawn("peasant");
      joinFaction(engine, entity.id, government);
      assignIdentity(engine, entity.id);
      engine.bus.processQueue();
      return entity;
    },
    identityOf,
    setLevel: (entityId, skillId, level) => {
      const skills = getComponent(engine.store.require(entityId), skillsComponent);
      if (skills === undefined) {
        throw new Error(`entity ${entityId} has no skills`);
      }
      skills.values[skillId] = level * 1000;
    },
    flush: () => engine.bus.processQueue(),
    ofKind: (kind) => recorded.filter((record) => record.kind === kind),
    chronicle: () => chronicleOf(engine)?.moments ?? [],
  };
}
