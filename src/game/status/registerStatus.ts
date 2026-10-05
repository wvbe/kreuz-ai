import { z } from "zod";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import { constructionSystemId } from "../construction/constructionTypes";
import type { GameEngine } from "../engine/GameEngine";
import { InitMode } from "../engine/engineSystemTypes";
import { TickSlot } from "../engine/TickPipeline";
import { jobsSystemId } from "../jobs/jobTypes";
import { productionSystemId } from "../production/productionTypes";
import { storageSystemId } from "../storage/storageTypes";
import { toDay } from "../time/GameTime";
import { zonesSystemId } from "../zones/zoneTypes";
import { explain } from "./explain";
import { registerFlowEvents } from "./flow/registerFlowEvents";
import { buildFlowRow, buildFlowRows } from "./flow/flowSummary";
import { buildIdleBlockedView } from "./idleBlocked";
import { boardProvider } from "./providers/boardProvider";
import { citizenProvider } from "./providers/citizenProvider";
import { loosePileProvider } from "./providers/loosePileProvider";
import { orderProvider } from "./providers/orderProvider";
import { postingProvider } from "./providers/postingProvider";
import { siteProvider } from "./providers/siteProvider";
import { workstationProvider } from "./providers/workstationProvider";
import { zoneProvider } from "./providers/zoneProvider";
import { refKey } from "./reasons";
import { runStatusPass, listSubjects } from "./statusEvaluation";
import { StatusService } from "./StatusService";
import { bindStatusService, getStatusService } from "./statusServiceRegistry";
import { ledgerSystemId, StatusState, StatusSubjectKind, statusSystemId } from "./statusTypes";
import { subjectOfEntity } from "./subjectOfEntity";

const registered = new WeakSet<GameEngine>();

/**
 * Registers the status system with an engine (once per engine; the engine does it for itself, so
 * every game has it, after construction). It adds:
 * - the provider registry (`getStatusService(engine).registerProvider`, spec 025 FR-005 as a pull
 *   model, DECISIONS D-18) with the providers `Citizen`, `Workstation`, `ProductionOrder`,
 *   `ConstructionSite`, `Zone`, `JobBoard`, `JobPosting` and `LoosePile`;
 * - the root save sections `statuses` (settle tracker) and `productionLedger` (flow ledger);
 * - the slot-18 system `status` (evaluates every subject, settles, emits `status.blocked` and
 *   `status.unblocked`) and the slot-19 system `status.ledger` (drops days that left the window);
 * - the ledger subscriptions (`production.crafting.completed`, `construction.job.completed`,
 *   `jobboard.job.completed`, `need.item.consumed`, `inventory.item.expired`,
 *   `housing.goods.consumed`);
 * - the queries `explain {id, kind?}`, `idle-blocked {includeUnsettled?, state?, kind?}`, `flow {}`
 *   and `flow-of {materialId}`. There are no commands.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerConstruction`.
 * @returns The engine's status service.
 */
export function registerStatus(engine: GameEngine): StatusService {
  if (registered.has(engine)) {
    return getStatusService(engine);
  }
  registered.add(engine);
  const service = new StatusService();
  bindStatusService(engine, service);
  for (const provider of [
    citizenProvider,
    workstationProvider,
    orderProvider,
    siteProvider,
    zoneProvider,
    boardProvider,
    postingProvider,
    loosePileProvider,
  ]) {
    service.registerProvider(provider);
  }
  registerFlowEvents(engine);
  engine.registerSystem({
    id: statusSystemId,
    dependencies: [
      aiSystemId,
      jobsSystemId,
      storageSystemId,
      zonesSystemId,
      productionSystemId,
      constructionSystemId,
    ],
    slot: TickSlot.Status,
    saveSection: service.tracker.createSection(),
    init: (context) => {
      if (context.mode === InitMode.LoadGame) {
        service.tracker.purgeOrphans(new Set(listSubjects(engine).map(refKey)));
      }
    },
    run: (context) => {
      runStatusPass(engine, context.tick);
    },
    queries: {
      explain: defineQuery({
        schema: z
          .object({
            id: z.number().int().min(1),
            kind: z.nativeEnum(StatusSubjectKind).optional(),
          })
          .strict(),
        run: ({ id, kind }, target) => {
          const ref = kind === undefined ? subjectOfEntity(target, id) : { kind, id };
          return ref === null ? null : explain(target, ref);
        },
      }),
      "idle-blocked": defineQuery({
        schema: z
          .object({
            includeUnsettled: z.boolean().optional(),
            state: z.nativeEnum(StatusState).optional(),
            kind: z.nativeEnum(StatusSubjectKind).optional(),
          })
          .strict(),
        run: (args, target) => buildIdleBlockedView(target, args),
      }),
      flow: defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => buildFlowRows(target),
      }),
      "flow-of": defineQuery({
        schema: z.object({ materialId: z.string().min(1) }).strict(),
        run: ({ materialId }, target) => buildFlowRow(target, materialId),
      }),
    },
  });
  engine.registerSystem({
    id: ledgerSystemId,
    dependencies: [statusSystemId],
    slot: TickSlot.LedgerRollover,
    saveSection: service.ledger.createSection(),
    run: (context) => {
      service.ledger.prune(toDay(context.tick));
    },
  });
  return service;
}
