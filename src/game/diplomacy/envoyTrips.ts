import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { governmentFactionId } from "../factions/factionRegistry";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { retrieve } from "../inventory/inventoryOperations";
import { storeUpTo } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import { resolveAct } from "./actResolution";
import {
  DiplomaticActType,
  DispatchFailureReason,
  EnvoyStatus,
  directiveCancelledEvent,
  dispatchFailedEvent,
  messageDeliveredEvent,
} from "./diplomacyTypes";
import type {
  DirectiveCancelled,
  DispatchFailed,
  EnvoyData,
  MessageDelivered,
} from "./diplomacyTypes";
import { envoyComponent } from "./envoyComponent";
import { listEnvoys, refundCargo } from "./envoys";
import { receiveProposal } from "./proposals";

function factionExists(engine: GameEngine, id: number): boolean {
  const entity = engine.store.get(id);
  return (
    entity !== undefined &&
    getComponent(entity, factionComponent) !== undefined &&
    !engine.store.isPendingDelete(id)
  );
}

/**
 * Fails a trip (spec 021 FR-011, D-14): queues `diplomacy.dispatch.failed`, gives a gift's cargo
 * back to the sender's treasury ({@link refundCargo}) and sends the envoy home; the act is not
 * applied. The envoy is removed `travelTicks` later.
 *
 * @param engine - The engine.
 * @param envoy - The envoy entity.
 * @param reason - Why the dispatch failed.
 * @param tick - The current tick.
 */
export function failEnvoy(
  engine: GameEngine,
  envoy: Entity,
  reason: DispatchFailureReason,
  tick: number,
): void {
  const data = getComponent(envoy, envoyComponent);
  if (data === undefined) {
    return;
  }
  const payload: DispatchFailed = {
    envoyId: envoy.id,
    senderFactionId: data.senderFactionId,
    targetFactionId: data.targetFactionId,
    reason,
  };
  engine.bus.emit(dispatchFailedEvent, payload);
  refundCargo(engine, envoy);
  data.status = EnvoyStatus.Returning;
  data.failure = reason;
  data.returnTick = tick + data.travelTicks;
}

function handCargoToLeader(
  engine: GameEngine,
  envoy: Entity,
  data: EnvoyData,
  leader: Entity,
): void {
  const context = { materials: engine.materials, actor: null, bus: engine.bus };
  for (const item of data.cargo) {
    const held = Math.min(item.quantity, getTotal(envoy, item.materialId));
    if (held < 1) {
      continue;
    }
    retrieve(context, envoy, item.materialId, held);
    if (hasComponent(leader, inventoryComponent)) {
      storeUpTo(context, leader, item.materialId, held);
    }
  }
  data.cargo = [];
}

function deliver(
  engine: GameEngine,
  envoy: Entity,
  data: EnvoyData,
  leader: Entity,
  tick: number,
): void {
  const payload: MessageDelivered = {
    envoyId: envoy.id,
    senderFactionId: data.senderFactionId,
    targetFactionId: data.targetFactionId,
    actType: data.actType,
  };
  engine.bus.emit(messageDeliveredEvent, payload);
  handCargoToLeader(engine, envoy, data, leader);
  const incoming = data.targetFactionId === governmentFactionId(engine);
  if (
    incoming &&
    (data.actType === DiplomaticActType.Overture ||
      data.actType === DiplomaticActType.TradeAgreement)
  ) {
    receiveProposal(engine, data.senderFactionId, data.actType, tick);
  } else {
    resolveAct(engine, envoy.id, data);
  }
  data.status = EnvoyStatus.Delivered;
  data.returnTick = tick + data.travelTicks;
}

function advance(engine: GameEngine, envoy: Entity, data: EnvoyData, tick: number): void {
  if (
    !factionExists(engine, data.targetFactionId) ||
    !factionExists(engine, data.senderFactionId)
  ) {
    failEnvoy(engine, envoy, DispatchFailureReason.LeaderUnavailable, tick);
    return;
  }
  if (tick >= data.arriveTick) {
    const leaderId =
      getComponent(engine.store.require(data.targetFactionId), factionComponent)?.leaderId ?? null;
    const leader =
      leaderId === null || engine.store.isPendingDelete(leaderId)
        ? undefined
        : engine.store.get(leaderId);
    if (leader !== undefined) {
      deliver(engine, envoy, data, leader, tick);
    } else if (tick >= data.deadlineTick) {
      failEnvoy(engine, envoy, DispatchFailureReason.LeaderUnavailable, tick);
    }
    return;
  }
  if (tick >= data.deadlineTick) {
    failEnvoy(engine, envoy, DispatchFailureReason.Unreachable, tick);
  }
}

/**
 * The envoy pass (slot 11, ascending envoy id). A traveling envoy whose `arriveTick` has come
 * hands its message to the target's **current** leader (a new leader mid-transit retargets it, a
 * leader who moved is irrelevant: seats are abstract) and heads home; with no leader it waits.
 * When `deadlineTick` (`envoyStuckTimeoutTicks` after the dispatch) passes the trip fails:
 * `unreachable` while it is still on its way, `leader-unavailable` when it waited at a leaderless
 * faction. A trip whose faction no longer exists also fails `leader-unavailable` (recalled).
 * Envoys that are home (`returnTick`) are removed. Envoys never fail any other way: there is no
 * combat (D-14).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 */
export function runEnvoys(engine: GameEngine, tick: number): void {
  for (const envoy of listEnvoys(engine)) {
    const data = getComponent(envoy, envoyComponent);
    if (data === undefined) {
      continue;
    }
    if (data.status === EnvoyStatus.Traveling) {
      advance(engine, envoy, data, tick);
    } else if (data.returnTick !== null && tick >= data.returnTick) {
      engine.store.requestDelete(envoy.id);
    }
  }
}

/**
 * Handles an envoy entity that is deleted by something other than {@link runEnvoys}: a trip that
 * was still under way fails with `envoy-destroyed` and its cargo goes back to the treasury (the
 * before-delete hook calls this; nothing in the game deletes envoys that way, D-14).
 *
 * @param engine - The engine.
 * @param envoy - The envoy about to be deleted.
 */
export function onEnvoyDeleted(engine: GameEngine, envoy: Entity): void {
  const data = getComponent(envoy, envoyComponent);
  if (data === undefined || data.status !== EnvoyStatus.Traveling) {
    return;
  }
  const payload: DispatchFailed = {
    envoyId: envoy.id,
    senderFactionId: data.senderFactionId,
    targetFactionId: data.targetFactionId,
    reason: DispatchFailureReason.EnvoyDestroyed,
  };
  engine.bus.emit(dispatchFailedEvent, payload);
  refundCargo(engine, envoy);
}

/**
 * Cancels a directive that is still under way (the player's `CancelDiplomaticDirective`): the
 * cargo is refunded, `diplomacy.directive.cancelled` is queued and the envoy is removed at once
 * (no act is applied, no failure is reported).
 *
 * @param engine - The engine.
 * @param envoy - The envoy entity.
 * @returns True when it was cancelled; false when it had already delivered or failed.
 */
export function cancelEnvoy(engine: GameEngine, envoy: Entity): boolean {
  const data = getComponent(envoy, envoyComponent);
  if (data === undefined || data.status !== EnvoyStatus.Traveling) {
    return false;
  }
  refundCargo(engine, envoy);
  data.status = EnvoyStatus.Returning;
  data.returnTick = engine.time.tickCount;
  const payload: DirectiveCancelled = {
    envoyId: envoy.id,
    senderFactionId: data.senderFactionId,
    targetFactionId: data.targetFactionId,
    actType: data.actType,
  };
  engine.bus.emit(directiveCancelledEvent, payload);
  engine.store.requestDelete(envoy.id);
  return true;
}
