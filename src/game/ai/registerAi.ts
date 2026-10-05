import { z } from "zod";
import { defineQuery } from "../api/defineQuery";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { registerPathfinding, pathfindingSystemId } from "../pathfinding/registerPathfinding";
import { AiService } from "./AiService";
import { bindAiService, getAiService } from "./aiServiceRegistry";
import { buildNeedsView } from "./aiViews";
import { aiSystemId } from "./aiTypes";
import { registerAiHandlers } from "./behavior/aiHandlers";
import { moodComponent } from "./mood/moodComponent";
import { createMoveTask } from "./movement/moveTask";
import { healthComponent } from "./needs/healthComponent";
import { needsComponent } from "./needs/needsComponent";
import { runNeedsTick } from "./needs/runNeeds";
import { runAiDecisions } from "./orchestration/runAiDecisions";
import { relationshipsComponent } from "./relationships/relationshipsComponent";
import { createIdleTask } from "./tasks/idleTask";
import { createSatisfyTask } from "./tasks/satisfyTask";

const registered = new WeakSet<GameEngine>();

const entityArgsSchema = z.object({ entityId: z.number().int().min(1) }).strict();

/**
 * Id of the system that runs the need decay and mood at slot 4.
 */
export const aiNeedsSystemId = "ai.needs";

/**
 * Id of the system that runs the decisions at slot 5.
 */
export const aiDecisionSystemId = "ai.decision";

/**
 * Registers the settler AI with an engine (once per engine; the engine does it for itself, so
 * every game has it). It adds:
 * - the components `Needs`, `Mood`, `Health` and `Relationships`;
 * - the task types `move`, `ai.satisfy` and `ai.idle`, and the behavior handlers
 *   `any_need_below_critical`, `satisfy_critical_need` and `idle_wander`;
 * - the slot-4 system `ai.needs` (decay, starvation, mood) and the slot-5 system `ai.decision`
 *   (runs the behavior tree of every entity that is due, see `runAiDecisions`);
 * - the query `needs-of {entityId}` (needs, mood, health, role, current action).
 *
 * Other tasks plug into the returned service: `registerNeedSource` (storage, stockpiles),
 * `registerDecisionFactor`, `setNeedDecayMultiplier` (difficulty). New task types and behavior
 * handlers go through `engine.taskHandlers` and `engine.behaviorHandlers` as usual; an entity's
 * behavior tree decides when they run.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`.
 * @returns The engine's AI service.
 */
export function registerAi(engine: GameEngine): AiService {
  if (registered.has(engine)) {
    return getAiService(engine);
  }
  registered.add(engine);
  const service = new AiService(engine.content, registerPathfinding(engine));
  bindAiService(engine, service);
  engine.taskHandlers.register(createMoveTask(engine));
  engine.taskHandlers.register(createSatisfyTask(engine));
  engine.taskHandlers.register(createIdleTask());
  registerAiHandlers(engine);
  engine.registerSystem({
    id: aiSystemId,
    dependencies: [pathfindingSystemId],
    components: [needsComponent, moodComponent, healthComponent, relationshipsComponent],
    init: ({ options }) => {
      service.setDifficulty(options.difficulty);
    },
    queries: {
      "needs-of": defineQuery({
        schema: entityArgsSchema,
        run: ({ entityId }, target) => {
          const entity = target.store.get(entityId);
          return entity === undefined ? null : buildNeedsView(target, entity);
        },
      }),
    },
  });
  engine.registerSystem({
    id: aiNeedsSystemId,
    dependencies: [aiSystemId],
    slot: TickSlot.NeedsAndMood,
    run: (context) => {
      runNeedsTick(engine, context.tick);
    },
  });
  engine.registerSystem({
    id: aiDecisionSystemId,
    dependencies: [aiSystemId],
    slot: TickSlot.AiDecision,
    run: (context) => {
      runAiDecisions(engine, context.tick);
    },
  });
  return service;
}
