import { dropLoosePile } from "../construction/siteRefund";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { isHostilePair } from "../factions/standingAttitude";
import { governmentFactionId } from "../factions/factionRegistry";
import { retrieve, transfer } from "../inventory/inventoryOperations";
import { InventoryError } from "../inventory/InventoryError";
import { getTotal } from "../inventory/inventoryQueries";
import { treasuryEntity } from "../trade/treasury";
import { hasAgreement } from "./agreements";
import { DiplomacyError, DiplomacyErrorKind } from "./DiplomacyError";
import { envoyComponent } from "./envoyComponent";
import { seatOf, travelTicks } from "./factionSeats";
import {
  DiplomaticActType,
  EnvoyStatus,
  actInitiatedEvent,
  diplomacyResolveStreamName,
  dispatchStartedEvent,
  envoyPrototypeId,
} from "./diplomacyTypes";
import type {
  ActInitiated,
  CargoItem,
  DeclarationKind,
  DispatchStarted,
  EnvoyData,
} from "./diplomacyTypes";

/**
 * What an act carries when it is ordered: the declaration subtype and the gift (coins and goods
 * taken from the treasury).
 */
export type ActRequest = {
  actType: DiplomaticActType;
  declaration: DeclarationKind | null;
  giftCoins: number;
  giftItems: CargoItem[];
};

/**
 * The envoys that exist (not those about to be deleted), ascending by entity id.
 *
 * @param engine - The engine that owns the entities.
 * @returns Entities with an `Envoy` component.
 */
export function listEnvoys(engine: GameEngine): Entity[] {
  return engine.store
    .entities()
    .filter(
      (entity) =>
        getComponent(entity, envoyComponent) !== undefined &&
        !engine.store.isPendingDelete(entity.id),
    );
}

/**
 * Envoys of a sending faction that are still under way (not yet delivered or returning).
 *
 * @param engine - The engine that owns the entities.
 * @param senderId - The sending faction.
 * @returns The entities, ascending.
 */
export function pendingEnvoysOf(engine: GameEngine, senderId: EntityId): Entity[] {
  return listEnvoys(engine).filter((entity) => {
    const data = getComponent(entity, envoyComponent);
    return data?.senderFactionId === senderId && data.status === EnvoyStatus.Traveling;
  });
}

function requireFaction(engine: GameEngine, id: EntityId): void {
  const entity = engine.store.get(id);
  if (entity === undefined || getComponent(entity, factionComponent) === undefined) {
    throw new DiplomacyError(DiplomacyErrorKind.UnknownFaction, `entity ${id} is not a faction`);
  }
}

/**
 * The value in whole coins of a gift: coins at face value plus the goods at `valueMilli`
 * (rounded down; a good without a value counts 0).
 *
 * @param engine - The engine (material values).
 * @param coins - Coins in the gift.
 * @param items - Goods in the gift.
 * @returns Whole coins.
 */
export function giftValueCoins(
  engine: GameEngine,
  coins: number,
  items: readonly CargoItem[],
): number {
  let milli = 0;
  for (const item of items) {
    milli += (engine.materials.require(item.materialId).valueMilli ?? 0) * item.quantity;
  }
  return coins + Math.floor(milli / 1000);
}

/**
 * Checks that an act can be ordered (DECISIONS section 3.8): both factions exist and differ, both
 * have a seat on the same map, the target has a leader, the sender has fewer than
 * `maxEnvoysPerFaction` envoys under way, a trade agreement is not proposed to a hostile faction
 * or when one stands, a gift is not empty and the treasury holds it, and only a gift carries goods.
 *
 * @param engine - The engine that owns the entities.
 * @param senderId - The sending faction.
 * @param targetId - The target faction.
 * @param request - The act.
 */
export function validateDispatch(
  engine: GameEngine,
  senderId: EntityId,
  targetId: EntityId,
  request: ActRequest,
): void {
  requireFaction(engine, senderId);
  requireFaction(engine, targetId);
  if (senderId === targetId) {
    throw new DiplomacyError(DiplomacyErrorKind.SelfTarget, "a faction cannot send to itself");
  }
  const isGift = request.actType === DiplomaticActType.Gift;
  const hasCargo = request.giftCoins > 0 || request.giftItems.length > 0;
  if (isGift !== hasCargo) {
    throw new DiplomacyError(
      DiplomacyErrorKind.InvalidAct,
      isGift ? "a gift needs coins or goods" : "only a gift carries coins or goods",
    );
  }
  if ((request.actType === DiplomaticActType.Declaration) !== (request.declaration !== null)) {
    throw new DiplomacyError(
      DiplomacyErrorKind.InvalidAct,
      "a declaration names war, peace or neutrality, other acts name none",
    );
  }
  if (seatOf(engine, senderId) === null || travelTicks(engine, senderId, targetId) === null) {
    throw new DiplomacyError(
      DiplomacyErrorKind.NoSeat,
      `faction ${senderId} or ${targetId} has no seat to send from or to`,
    );
  }
  const target = getComponent(engine.store.require(targetId), factionComponent);
  if (target?.leaderId === null || target === undefined) {
    throw new DiplomacyError(
      DiplomacyErrorKind.TargetLeaderless,
      `faction ${targetId} has no leader to receive the envoy`,
    );
  }
  if (request.actType === DiplomaticActType.TradeAgreement) {
    if (isHostilePair(engine, senderId, targetId)) {
      throw new DiplomacyError(
        DiplomacyErrorKind.HostileGate,
        `faction ${targetId} is hostile; no agreement can be proposed`,
      );
    }
    if (hasAgreement(engine, senderId, targetId)) {
      throw new DiplomacyError(
        DiplomacyErrorKind.AgreementExists,
        `factions ${senderId} and ${targetId} already have a trade agreement`,
      );
    }
  }
  if (pendingEnvoysOf(engine, senderId).length >= engine.content.constants.maxEnvoysPerFaction) {
    throw new DiplomacyError(
      DiplomacyErrorKind.TooManyEnvoys,
      `faction ${senderId} already has ${engine.content.constants.maxEnvoysPerFaction} envoys under way`,
    );
  }
  if (hasCargo) {
    const treasury = treasuryEntity(engine);
    if (senderId !== governmentFactionId(engine) || treasury === null) {
      throw new DiplomacyError(
        DiplomacyErrorKind.InvalidAct,
        "only the settlement can send a gift",
      );
    }
    const coin = engine.materials.currencyId;
    if (request.giftCoins > getTotal(treasury, coin)) {
      throw new DiplomacyError(
        DiplomacyErrorKind.InsufficientFunds,
        `the treasury holds ${getTotal(treasury, coin)} coins, ${request.giftCoins} asked`,
      );
    }
    for (const item of request.giftItems) {
      engine.materials.require(item.materialId);
      if (getTotal(treasury, item.materialId) < item.quantity) {
        throw new DiplomacyError(
          DiplomacyErrorKind.InsufficientFunds,
          `the treasury holds ${getTotal(treasury, item.materialId)} ${item.materialId}, ${item.quantity} asked`,
        );
      }
    }
  }
}

function cargoOf(engine: GameEngine, request: ActRequest): CargoItem[] {
  const merged = new Map<string, number>();
  for (const item of request.giftItems) {
    merged.set(item.materialId, (merged.get(item.materialId) ?? 0) + item.quantity);
  }
  if (request.giftCoins > 0) {
    const coin = engine.materials.currencyId;
    merged.set(coin, (merged.get(coin) ?? 0) + request.giftCoins);
  }
  return [...merged.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([materialId, quantity]) => ({ materialId, quantity }));
}

function loadCargo(engine: GameEngine, envoy: Entity, cargo: readonly CargoItem[]): void {
  const treasury = treasuryEntity(engine);
  if (treasury === null) {
    return;
  }
  const context = { materials: engine.materials, actor: null, bus: engine.bus };
  const moved: CargoItem[] = [];
  try {
    for (const item of cargo) {
      transfer(context, treasury, envoy, item.materialId, item.quantity);
      moved.push(item);
    }
  } catch (failure) {
    for (const item of moved) {
      transfer(context, envoy, treasury, item.materialId, item.quantity);
    }
    if (failure instanceof InventoryError) {
      throw new DiplomacyError(
        DiplomacyErrorKind.CargoTooLarge,
        `the gift does not fit on an envoy: ${failure.message}`,
      );
    }
    throw failure;
  }
}

/**
 * Orders an act (spec 021 FR-004/FR-009, D-14, D-56): validates it, moves a gift's coins and goods
 * from the treasury into a new envoy's cargo (the gift is held there until delivery or refund),
 * spawns the envoy entity and queues `diplomacy.act.initiated` and `diplomacy.dispatch.started`.
 * The trip takes `travelTicks` of the two seats' distance plus a jitter of `envoyJitterTicks`
 * drawn from the stream `diplomacy.resolve`; it times out `envoyStuckTimeoutTicks` after the
 * dispatch.
 *
 * @param engine - The engine that owns the entities.
 * @param senderId - The sending faction.
 * @param targetId - The target faction.
 * @param request - The act.
 * @param tick - The current tick.
 * @returns The new envoy entity.
 */
export function dispatchAct(
  engine: GameEngine,
  senderId: EntityId,
  targetId: EntityId,
  request: ActRequest,
  tick: number,
): Entity {
  validateDispatch(engine, senderId, targetId, request);
  const constants = engine.content.constants;
  const oneWay = travelTicks(engine, senderId, targetId) ?? 1;
  const jitter =
    constants.envoyJitterTicks < 1
      ? 0
      : engine.prng.stream(diplomacyResolveStreamName).nextInt(0, constants.envoyJitterTicks);
  const cargo = cargoOf(engine, request);
  const data: EnvoyData = {
    senderFactionId: senderId,
    targetFactionId: targetId,
    actType: request.actType,
    declaration: request.declaration,
    cargo,
    giftValueCoins: giftValueCoins(engine, request.giftCoins, request.giftItems),
    creationTick: tick,
    travelTicks: oneWay + jitter,
    arriveTick: tick + oneWay + jitter,
    deadlineTick: tick + constants.envoyStuckTimeoutTicks,
    status: EnvoyStatus.Traveling,
    returnTick: null,
    failure: null,
  };
  const envoy = engine.store.spawn(envoyPrototypeId, { Envoy: data });
  loadCargo(engine, envoy, cargo);
  const initiated: ActInitiated = {
    senderFactionId: senderId,
    targetFactionId: targetId,
    actType: request.actType,
  };
  engine.bus.emit(actInitiatedEvent, initiated);
  const started: DispatchStarted = { envoyId: envoy.id, ...initiated };
  engine.bus.emit(dispatchStartedEvent, started);
  return envoy;
}

/**
 * Gives an envoy's undelivered cargo back to the sender's treasury (D-14 gift refund). What the
 * treasury cannot take is dropped as a `loose_pile` on the market cell (the seat of the player's
 * government). Only the player's gifts are accounted: an envoy of another faction holds nothing.
 *
 * @param engine - The engine that owns the entities.
 * @param envoy - The envoy entity (its inventory is emptied).
 * @returns The refunded stacks.
 */
export function refundCargo(engine: GameEngine, envoy: Entity): CargoItem[] {
  const data = getComponent(envoy, envoyComponent);
  const treasury = treasuryEntity(engine);
  if (data === undefined || data.cargo.length === 0) {
    return [];
  }
  const context = { materials: engine.materials, actor: null, bus: engine.bus };
  const refunded: CargoItem[] = [];
  const dropped: CargoItem[] = [];
  for (const item of data.cargo) {
    const held = Math.min(item.quantity, getTotal(envoy, item.materialId));
    if (held < 1) {
      continue;
    }
    if (treasury !== null) {
      try {
        transfer(context, envoy, treasury, item.materialId, held);
        refunded.push({ materialId: item.materialId, quantity: held });
        continue;
      } catch (failure) {
        if (!(failure instanceof InventoryError)) {
          throw failure;
        }
      }
    }
    retrieve(context, envoy, item.materialId, held);
    dropped.push({ materialId: item.materialId, quantity: held });
  }
  const seat = seatOf(engine, data.senderFactionId);
  if (seat !== null) {
    dropLoosePile(engine, seat.mapId, seat.cellIndex, dropped);
  }
  data.cargo = [];
  return [...refunded, ...dropped];
}
