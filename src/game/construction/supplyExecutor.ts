import { z } from "zod";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { transfer } from "../inventory/inventoryOperations";
import { canStore, getTotal } from "../inventory/inventoryQueries";
import { childCompleted, registerJobType } from "../jobs/jobExecutor";
import type { ActiveJob, JobExecutor } from "../jobs/jobExecutor";
import { approachFailedReason, targetInvalidReason } from "../jobs/jobTypes";
import type { JobOutput } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { findSources } from "../storage/storageQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { childWait, doneStep, failStep, waitStep } from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { findSite } from "./buildSiteQueries";
import type { SiteRef } from "./buildSiteQueries";
import {
  noCarryCapacityReason,
  noSourceReason,
  siteBlockedReason,
  SiteKind,
  supplyJobId,
} from "./constructionTypes";
import { spawnLoosePile } from "./siteRefund";

enum SupplyPhase {
  ToSource = "to-source",
  ToSite = "to-site",
}

const supplyStateSchema = z
  .object({
    postingId: z.number().int().min(1),
    claimId: z.number().int().min(1),
    reservationId: z.number().int().min(1).nullable().default(null),
    carried: z.number().int().min(0).default(0),
    delivered: z.number().int().min(0).default(0),
    materialId: z.string().min(1).nullable().default(null),
    siteId: z.number().int().min(1).nullable().default(null),
  })
  .strict();

type SupplyState = z.infer<typeof supplyStateSchema>;

function readState(data: JsonValue): SupplyState {
  return supplyStateSchema.parse(data);
}

function writeState(context: TaskContext, state: SupplyState): void {
  context.task.data = { ...state };
}

function materialOf(job: ActiveJob): string | null {
  return job.posting.target.materialId;
}

function resolveSite(engine: GameEngine, job: ActiveJob): SiteRef | null {
  const siteId = job.posting.target.entityId;
  const site = siteId === null ? null : findSite(engine, siteId);
  return site !== null && site.data.kind === SiteKind.Construct ? site : null;
}

/**
 * Units of a material the site still needs.
 *
 * @param site - The site.
 * @param materialId - The material.
 * @returns The lack, 0 when the site has enough or does not need the material.
 */
function needOf(site: SiteRef, materialId: string): number {
  const required = site.data.required.find((item) => item.materialId === materialId)?.quantity ?? 0;
  return Math.max(0, required - getTotal(site.entity, materialId));
}

/**
 * Puts what the supplier carries on the ground where it stands (a loose pile the haul poster
 * takes to storage), so a failed trip never strands goods in a pocket.
 *
 * @param engine - The engine.
 * @param hauler - The supplier.
 * @param materialId - The material it carries.
 * @param carried - How many units the task record says it carries.
 */
function dropCarried(
  engine: GameEngine,
  hauler: Entity,
  materialId: string,
  carried: number,
): void {
  const held = Math.min(carried, getTotal(hauler, materialId));
  const place = getComponent(hauler, positionComponent);
  if (held < 1 || place === undefined) {
    return;
  }
  const pile = spawnLoosePile(engine, place.mapId, place.cellIndex);
  transfer(
    { materials: engine.materials, actor: hauler.id, bus: engine.bus },
    hauler,
    pile,
    materialId,
    held,
  );
}

function clearSupplier(engine: GameEngine, job: ActiveJob, supplierId: number): void {
  const site = resolveSite(engine, job);
  if (site !== null && site.data.supplierId === supplierId) {
    site.data.supplierId = null;
  }
}

function abort(
  engine: GameEngine,
  context: TaskContext,
  state: SupplyState,
  job: ActiveJob,
  reason: string,
): StepResult {
  if (state.reservationId !== null) {
    getStorageService(engine).reservations.release(state.reservationId);
    state.reservationId = null;
  }
  const materialId = materialOf(job);
  if (materialId !== null) {
    dropCarried(engine, context.entity, materialId, state.carried);
  }
  state.carried = 0;
  clearSupplier(engine, job, context.entityId);
  return failStep(reason);
}

function walkTo(
  context: TaskContext,
  state: SupplyState,
  phase: SupplyPhase,
  mapId: number,
  cell: number,
): StepResult {
  context.task.phase = phase;
  writeState(context, state);
  return waitStep(childWait(context.spawnChild(AiTaskType.Move, moveTaskData(mapId, cell))));
}

function deposit(
  engine: GameEngine,
  context: TaskContext,
  state: SupplyState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const site = resolveSite(engine, job);
  if (site === null) {
    return abort(engine, context, state, job, targetInvalidReason);
  }
  const held = Math.min(state.carried, getTotal(context.entity, materialId));
  const amount = Math.min(
    held,
    needOf(site, materialId),
    canStore(engine.materials, site.entity, materialId, held).maxFittable,
  );
  if (amount > 0) {
    transfer(
      { materials: engine.materials, actor: context.entityId, bus: engine.bus },
      context.entity,
      site.entity,
      materialId,
      amount,
    );
    state.delivered += amount;
  }
  // What the site no longer needs (somebody else delivered meanwhile) is not carried around.
  dropCarried(engine, context.entity, materialId, held - amount);
  state.carried = 0;
  if (site.data.supplierId === context.entityId) {
    site.data.supplierId = null;
  }
  writeState(context, state);
  return doneStep();
}

function goToSite(
  engine: GameEngine,
  context: TaskContext,
  state: SupplyState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const site = resolveSite(engine, job);
  const place = site === null ? undefined : getComponent(site.entity, positionComponent);
  const here = getComponent(context.entity, positionComponent);
  if (site === null || place === undefined || here === undefined || here.mapId !== place.mapId) {
    return abort(engine, context, state, job, siteBlockedReason);
  }
  return here.cellIndex === place.cellIndex
    ? deposit(engine, context, state, job, materialId)
    : walkTo(context, state, SupplyPhase.ToSite, place.mapId, place.cellIndex);
}

function pickUp(
  engine: GameEngine,
  context: TaskContext,
  state: SupplyState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  if (state.reservationId === null) {
    return abort(engine, context, state, job, noSourceReason);
  }
  try {
    const moved = getStorageService(engine).reservations.commit(
      state.reservationId,
      context.entity,
    );
    state.reservationId = null;
    state.carried = moved.quantity;
  } catch {
    // Nothing moved (the stock changed or the reservation was dropped): all or nothing.
    return abort(engine, context, state, job, noSourceReason);
  }
  return goToSite(engine, context, state, job, materialId);
}

function approachSource(
  engine: GameEngine,
  context: TaskContext,
  state: SupplyState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const reservation =
    state.reservationId === null
      ? null
      : getStorageService(engine).reservations.get(state.reservationId);
  const source = reservation === null ? undefined : engine.store.get(reservation.inventoryOwnerId);
  const place = source === undefined ? undefined : getComponent(source, positionComponent);
  const here = getComponent(context.entity, positionComponent);
  if (place === undefined || here === undefined || place.mapId !== here.mapId) {
    return abort(engine, context, state, job, noSourceReason);
  }
  return place.cellIndex === here.cellIndex
    ? pickUp(engine, context, state, job, materialId)
    : walkTo(context, state, SupplyPhase.ToSource, place.mapId, place.cellIndex);
}

function begin(engine: GameEngine, context: TaskContext, job: ActiveJob): StepResult {
  const state = readState(context.task.data);
  const materialId = materialOf(job);
  const site = resolveSite(engine, job);
  if (materialId === null || site === null) {
    return failStep(targetInvalidReason);
  }
  if (site.data.supplierId !== null && site.data.supplierId !== context.entityId) {
    return failStep(siteBlockedReason);
  }
  const need = needOf(site, materialId);
  if (need < 1) {
    return failStep(targetInvalidReason);
  }
  const quantity = Math.min(
    need,
    canStore(engine.materials, context.entity, materialId, need).maxFittable,
  );
  if (quantity < 1) {
    return failStep(noCarryCapacityReason);
  }
  const source = findSources(engine, context.entity, materialId, quantity)[0];
  if (source === undefined) {
    return failStep(noSourceReason);
  }
  state.reservationId = getStorageService(engine).reservations.reserve({
    kind: ReservationKind.Supply,
    holderId: context.entityId,
    inventoryOwnerId: source.entityId,
    materialId,
    quantity: Math.min(quantity, source.quantity),
  }).id;
  site.data.supplierId = context.entityId;
  state.materialId = materialId;
  state.siteId = site.entity.id;
  return approachSource(engine, context, state, job, materialId);
}

/**
 * Builds the executor of `build.supply` (spec 016 FR-004/FR-005, plan 3.5). A claimed posting
 * names a build site (`target.entityId`) and a material (`target.materialId`); one claim is one
 * trip. The supplier:
 * 1. works out what the site still lacks of the material and what it can carry, finds the nearest
 *    source (`findSources`) and takes that much of the source's unreserved stock under a `Supply`
 *    reservation (a site has one supplier at a time, so deliveries never overshoot);
 * 2. walks to the source (phase `to-source`) and moves the reserved goods into its inventory with
 *    `commit`;
 * 3. walks to the site (phase `to-site`) and deposits what the site still needs into the site's
 *    inventory (the staged materials, excluded from storage queries).
 *
 * Interrupt safety: every step keeps the goods in the source, under a reservation or in the
 * supplier's inventory; a failed or cancelled trip releases the reservation and drops carried
 * goods as a loose pile (the haul poster takes it to storage), so nothing is lost or duplicated.
 * Failure reasons: `target_invalid`, `site_blocked`, `no_capacity`, `no_source`,
 * `approach_failed`. All progress is in the task record, so a save resumes mid-trip.
 *
 * @param engine - The engine.
 * @returns An executor for `registerJobType`.
 */
export function createSupplyExecutor(engine: GameEngine): JobExecutor {
  return {
    requires: ["Position", "Inventory"],
    start: (context, job) => begin(engine, context, job),
    step: (context, record, job) => {
      const state = readState(record.data);
      const materialId = materialOf(job);
      if (materialId === null) {
        return abort(engine, context, state, job, targetInvalidReason);
      }
      if (!childCompleted(record)) {
        return abort(engine, context, state, job, approachFailedReason);
      }
      return record.phase === SupplyPhase.ToSource
        ? approachSource(engine, context, state, job, materialId)
        : goToSite(engine, context, state, job, materialId);
    },
    complete: (): JobOutput[] => [],
    cancel: (context, record) => {
      const state = readState(record.data);
      if (state.reservationId !== null) {
        getStorageService(engine).reservations.release(state.reservationId);
      }
      const site = state.siteId === null ? null : findSite(engine, state.siteId);
      if (site !== null && site.data.supplierId === context.entityId) {
        site.data.supplierId = null;
      }
      if (state.materialId !== null) {
        dropCarried(engine, context.entity, state.materialId, state.carried);
      }
    },
  };
}

/**
 * Registers the executor of `build.supply` with the engine's task handlers (see
 * {@link createSupplyExecutor}).
 *
 * @param engine - The engine.
 */
export function registerSupply(engine: GameEngine): void {
  registerJobType(engine, supplyJobId, createSupplyExecutor(engine));
}
