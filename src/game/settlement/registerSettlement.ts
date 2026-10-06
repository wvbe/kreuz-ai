import { z } from "zod";
import { SettlementTier } from "../content/contentTypes";
import { defineQuery } from "../api/defineQuery";
import { getComponent } from "../ecs/Entity";
import { governmentFactionId } from "../factions/factionRegistry";
import { factionsSystemId } from "../factions/factionTypes";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { getJobService } from "../jobs/jobServiceRegistry";
import { jobsSystemId } from "../jobs/jobTypes";
import { zonesSystemId } from "../zones/zoneTypes";
import { runTierEvaluation } from "./runTierEvaluation";
import { SettlementService } from "./SettlementService";
import { settlementChronicleComponent } from "./settlementChronicleComponent";
import { settlementProgressComponent } from "./settlementProgressComponent";
import { bindSettlementService, getSettlementService } from "./settlementServiceRegistry";
import { settlementSystemId, LockedContentKind } from "./settlementTypes";
import { buildMilestoneViews, buildSettlementProgressView } from "./settlementViews";
import { orderedTiers, tierRank } from "./tierOrder";
import { buildUnlockViews } from "./unlocks";
import { subscribeMilestones } from "./subscribeMilestones";
import { InitMode } from "../engine/engineSystemTypes";

const registered = new WeakSet<GameEngine>();

const noArgs = z.object({}).strict();
const unlocksArgs = z
  .object({
    contentKind: z.enum(LockedContentKind).optional(),
    tier: z.enum(SettlementTier).optional(),
    lockedOnly: z.boolean().optional(),
  })
  .strict();

// Gives the government faction its settlement components when it lacks them (a save from before
// task 4.4) and caches the tier in force. A new game sets the tier to the `startingTier` option:
// that tier and every lower one are reached at tick 0 and no milestone is recorded (spec 027
// FR-021, FR-022).
function initSettlement(
  engine: GameEngine,
  service: SettlementService,
  mode: InitMode,
  startingTier: string | null,
): void {
  const government = governmentFactionId(engine);
  if (government === null) {
    service.setTier(SettlementTier.Hamlet);
    return;
  }
  const entity = engine.store.require(government);
  if (getComponent(entity, settlementProgressComponent) === undefined) {
    engine.store.addComponent(government, settlementProgressComponent);
  }
  if (getComponent(entity, settlementChronicleComponent) === undefined) {
    engine.store.addComponent(government, settlementChronicleComponent);
  }
  const progress = getComponent(entity, settlementProgressComponent);
  if (progress === undefined) {
    return;
  }
  if (mode === InitMode.NewGame) {
    const rank = Math.max(0, tierRank(startingTier ?? SettlementTier.Hamlet));
    const reached: { [tier: string]: number } = {};
    for (const tier of orderedTiers.slice(0, rank + 1)) {
      reached[tier] = 0;
    }
    progress.tier = orderedTiers[rank] ?? SettlementTier.Hamlet;
    progress.tierReachedAtTick = reached;
  }
  service.setTier(progress.tier);
}

/**
 * Registers the settlement tiers with an engine (once per engine; the engine does it for itself,
 * after diplomacy). It adds:
 * - the components `SettlementProgress` and `SettlementChronicle` (on the government faction;
 *   saved with the entities);
 * - the init that applies the `startingTier` option and caches the tier in force, and the tier
 *   source of the job service, which every gate reads (job eligibility and postings, zone
 *   designation, production orders, construction placement, the build menu, status);
 * - the milestone detectors (`subscribeMilestones`);
 * - the slot-15 system `settlement`: on the first tick of every day (`tickOfDay == 0`, tick above
 *   0) `runTierEvaluation` (one promotion at most, `settlement.tier.reached`);
 * - the queries `settlement-progress`, `unlocks` and `milestones`.
 *
 * There are no commands: the tier only changes through its requirements. The difficulty's decay,
 * need decay and hostility multipliers are read by the inventory, AI and diplomacy systems from
 * the game options (spec 027 FR-013..016).
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerJobs` and `registerDiplomacy`.
 * @returns The engine's settlement service.
 */
export function registerSettlement(engine: GameEngine): SettlementService {
  if (registered.has(engine)) {
    return getSettlementService(engine);
  }
  registered.add(engine);
  const service = new SettlementService();
  bindSettlementService(engine, service);
  getJobService(engine).setTierSource(() => service.tier());
  subscribeMilestones(engine);
  engine.registerSystem({
    id: settlementSystemId,
    dependencies: [factionsSystemId, jobsSystemId, zonesSystemId],
    slot: TickSlot.TierDay,
    components: [settlementProgressComponent, settlementChronicleComponent],
    init: ({ engine: target, mode, options }) => {
      initSettlement(target, service, mode, options.startingTier);
    },
    run: (context) => {
      if (context.tickOfDay === 0 && context.tick > 0) {
        runTierEvaluation(engine, context.tick);
      }
    },
    queries: {
      "settlement-progress": defineQuery({
        schema: noArgs,
        run: (_args, target) => buildSettlementProgressView(target),
      }),
      unlocks: defineQuery({
        schema: unlocksArgs,
        run: (args, target) =>
          buildUnlockViews(target).filter(
            (row) =>
              (args.contentKind === undefined || row.contentKind === args.contentKind) &&
              (args.tier === undefined || row.unlockTier === args.tier) &&
              (args.lockedOnly !== true || !row.unlocked),
          ),
      }),
      milestones: defineQuery({
        schema: noArgs,
        run: (_args, target) => buildMilestoneViews(target),
      }),
    },
  });
  return service;
}
