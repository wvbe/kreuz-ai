import { z } from "zod";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import { getAiService } from "../ai/aiServiceRegistry";
import { AnimalKind } from "../content/contentTypes";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { diplomacySystemId } from "../diplomacy/diplomacyTypes";
import { InitMode } from "../engine/engineSystemTypes";
import { jobsSystemId } from "../jobs/jobTypes";
import { readWorldLayout } from "../worldgen/readWorldLayout";
import { spawnFauna } from "../worldgen/spawnFauna";
import { animalComponent } from "./animalComponent";
import { registerAnimalHandlers } from "./animalHandlers";
import { registerAnimalJobs } from "./animalJobs";
import { animalContentOf, matchesSense, senseNearest } from "./animalSenses";
import { buildAnimalsView } from "./animalViews";
import { hasTaskAtLeast } from "./animalMovement";
import { runFaunaTick } from "./runFaunaTick";
import { faunaSystemId, faunaTickSystemId, FaunaTaskPriority, SenseKind } from "./faunaTypes";

const registered = new WeakSet<GameEngine>();

const animalsArgsSchema = z
  .object({
    kind: z.enum(AnimalKind).optional(),
    prototypeId: z.string().min(1).optional(),
  })
  .strict();

/**
 * Ticks between two threat scans of one busy animal (it is scanned on the ticks where
 * `tick % wakeScanInterval` equals `entityId % wakeScanInterval`, so the work is spread out).
 */
export const wakeScanInterval = 4;

/**
 * The wake check of animals: a busy animal that has no flee task yet is given a decision when a
 * threat is within its flee radius (humanoids for wild animals, predators for livestock), so a
 * stroll is interrupted by the threat.
 *
 * @param engine - The engine.
 * @param entity - The busy animal (other entities never wake).
 * @returns True when the animal should decide now.
 */
export function animalWakesForThreat(engine: GameEngine, entity: Entity): boolean {
  const content = animalContentOf(engine, entity);
  if (
    content === undefined ||
    content.fleeRadiusCost === 0 ||
    (engine.time.tickCount + entity.id) % wakeScanInterval !== 0 ||
    hasTaskAtLeast(entity, FaunaTaskPriority.Flee)
  ) {
    return false;
  }
  const kind = content.kind === AnimalKind.Livestock ? SenseKind.Predator : SenseKind.Humanoid;
  return (
    senseNearest(engine, entity, content.fleeRadiusCost, (other) =>
      matchesSense(engine, kind, other),
    ) !== null
  );
}

/**
 * Registers animals with an engine (once per engine; the engine does it for itself, so every game
 * has it). It adds:
 * - the `Animal` component (the animal prototypes of the content pack carry it) and the handlers
 *   the animal behavior trees name;
 * - the executors of `tend.animals`, `butcher.animal` and `hunt.game`;
 * - the slot-4 system `fauna.tick` (hunger, periodic products), its new-game init that places the
 *   wild animals (`spawnFauna`, after the NPC factions) and the AI wake check that lets an
 *   animal that sees a threat decide while it strolls;
 * - the query `animals {kind?, prototypeId?}`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerAi` and `registerJobs`.
 */
export function registerFauna(engine: GameEngine): void {
  if (registered.has(engine)) {
    return;
  }
  registered.add(engine);
  registerAnimalHandlers(engine);
  registerAnimalJobs(engine);
  getAiService(engine).registerWakeCheck(animalWakesForThreat);
  engine.registerSystem({
    id: faunaSystemId,
    dependencies: [aiSystemId, jobsSystemId],
    components: [animalComponent],
    queries: {
      animals: defineQuery({
        schema: animalsArgsSchema,
        run: (args, target) => buildAnimalsView(target, args),
      }),
    },
  });
  engine.registerSystem({
    id: faunaTickSystemId,
    dependencies: [faunaSystemId, diplomacySystemId, "world.starting-map"],
    init: ({ engine: target, mode }) => {
      const layout = mode === InitMode.NewGame ? readWorldLayout(target) : null;
      if (layout !== null && layout.villageCell !== null) {
        spawnFauna(target, layout.mapId, layout.villageCell);
      }
    },
    slot: TickSlot.NeedsAndMood,
    run: (context) => {
      runFaunaTick(engine, context.tick);
    },
  });
}
