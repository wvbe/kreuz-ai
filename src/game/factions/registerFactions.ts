import { z } from "zod";
import { defineQuery } from "../api/defineQuery";
import { getComponent } from "../ecs/Entity";
import { RelationshipDirection } from "../ecs/RelationshipRegistry";
import { InitMode } from "../engine/engineSystemTypes";
import type { GameEngine } from "../engine/GameEngine";
import { cleanUpFactionReferences } from "./cleanUpFactionReferences";
import { citizenComponent } from "./citizenComponent";
import { factionComponent } from "./factionComponent";
import { FactionError, FactionErrorKind } from "./FactionError";
import { membersOf } from "./factionMembership";
import { listFactions } from "./factionRegistry";
import { factionsSystemId } from "./factionTypes";
import { buildFactionView, buildMembershipView } from "./factionViews";

const registered = new WeakSet<GameEngine>();

const entityArgsSchema = z.object({ entityId: z.number().int().min(1) }).strict();
const factionArgsSchema = z.object({ factionId: z.number().int().min(1) }).strict();

function dangling(message: string): FactionError {
  return new FactionError(FactionErrorKind.DanglingReference, message);
}

function validateReferences(engine: GameEngine): void {
  const isFaction = (id: number): boolean => {
    const entity = engine.store.get(id);
    return entity !== undefined && getComponent(entity, factionComponent) !== undefined;
  };
  for (const entity of engine.store.entities()) {
    const faction = getComponent(entity, factionComponent);
    if (faction !== undefined) {
      if (faction.contentId !== null && !engine.content.factions.has(faction.contentId)) {
        throw dangling(`faction ${entity.id} has unknown content faction "${faction.contentId}"`);
      }
      const leader = faction.leaderId === null ? undefined : engine.store.get(faction.leaderId);
      if (
        faction.leaderId !== null &&
        (leader === undefined || getComponent(leader, citizenComponent) === undefined)
      ) {
        throw dangling(`faction ${entity.id} has leader ${faction.leaderId} who is not a citizen`);
      }
      for (const entry of faction.standing) {
        if (!isFaction(entry.factionId)) {
          throw dangling(
            `faction ${entity.id} has standing toward unknown faction ${entry.factionId}`,
          );
        }
      }
    }
    for (const id of getComponent(entity, citizenComponent)?.factions ?? []) {
      if (!isFaction(id)) {
        throw dangling(`citizen ${entity.id} belongs to unknown faction ${id}`);
      }
    }
  }
}

/**
 * Registers the factions system with an engine through `engine.registerSystem` (once per engine;
 * the engine does it for itself, so every game has it). It owns the `Faction` and `Citizen`
 * components (part of the entities save section, so no save section of its own), registers the
 * relationships `members`/`factions` and `leader`, adds a before-delete hook that cleans dangling
 * references (deleted faction leaves every member list and standing list, deleted leader empties
 * `leaderId`), validates references on load (a dangling one is a `FactionError`, so `loadGame`
 * fails and keeps the current game) and adds the queries `factions` (`{}`), `faction-of`
 * (`{entityId}`) and `members-of` (`{factionId}`; `null` for an unknown faction).
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`.
 */
export function registerFactions(engine: GameEngine): void {
  if (registered.has(engine)) {
    return;
  }
  registered.add(engine);
  engine.relationships.registerPair({
    forwardName: "factions",
    inverseName: "members",
    component: "Citizen",
    field: "factions",
    forwardMany: true,
  });
  engine.relationships.register({
    name: "leader",
    component: "Faction",
    field: "leaderId",
    direction: RelationshipDirection.Forward,
    many: false,
  });
  engine.store.addBeforeDeleteHook((entity) => {
    cleanUpFactionReferences(engine, entity);
    return null;
  });
  engine.registerSystem({
    id: factionsSystemId,
    components: [factionComponent, citizenComponent],
    init: ({ engine: target, mode }) => {
      if (mode === InitMode.LoadGame) {
        validateReferences(target);
      }
    },
    queries: {
      factions: defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) =>
          listFactions(target).map((entity) => buildFactionView(target, entity)),
      }),
      "faction-of": defineQuery({
        schema: entityArgsSchema,
        run: ({ entityId }, target) =>
          target.store.get(entityId) === undefined ? null : buildMembershipView(target, entityId),
      }),
      "members-of": defineQuery({
        schema: factionArgsSchema,
        run: ({ factionId }, target) => {
          const entity = target.store.get(factionId);
          return entity === undefined || getComponent(entity, factionComponent) === undefined
            ? null
            : { factionId, memberIds: membersOf(target, factionId).map((member) => member.id) };
        },
      }),
    },
  });
}
