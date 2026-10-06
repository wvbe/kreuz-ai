import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { governmentFactionId, listFactions } from "../factions/factionRegistry";
import type { FactionSeat } from "../factions/factionTypes";
import { getStanding } from "../factions/factionStanding";
import { attitudeOfValue } from "../factions/attitudeBands";
import { isHostilePair } from "../factions/standingAttitude";
import { styledName } from "../identity/styledName";
import { listAgreements } from "./agreements";
import { getDiplomacyService } from "./diplomacyServiceRegistry";
import { EnvoyStatus } from "./diplomacyTypes";
import type { CargoItem } from "./diplomacyTypes";
import { envoyComponent } from "./envoyComponent";
import { pendingEnvoysOf, listEnvoys } from "./envoys";
import { seatOf, travelTicks } from "./factionSeats";
import { isNpcFaction } from "./standingRules";

/**
 * One faction as the player's diplomacy table shows it (query `factions-diplomacy`).
 */
export type DiplomacyFactionView = {
  readonly factionId: EntityId;
  readonly contentId: string | null;
  readonly name: string;
  readonly factionType: string;
  readonly disposition: string;
  readonly npc: boolean;
  readonly leaderId: EntityId | null;
  readonly leaderName: string | null;
  readonly seat: FactionSeat | null;
  /**
   * Ticks an envoy needs one way (without jitter), null without a seat.
   */
  readonly travelTicks: number | null;
  /**
   * The settlement's view of the faction: standing and band.
   */
  readonly ourStanding: number;
  readonly ourAttitude: string;
  /**
   * The faction's view of the settlement.
   */
  readonly theirStanding: number;
  readonly theirAttitude: string;
  readonly tradeAgreement: boolean;
  readonly hostile: boolean;
  readonly envoysUnderWay: number;
};

/**
 * One envoy as a directive or envoy listing shows it (queries `directives` and `envoys`).
 */
export type EnvoyView = {
  readonly envoyId: EntityId;
  readonly senderFactionId: EntityId;
  readonly senderName: string;
  readonly targetFactionId: EntityId;
  readonly targetName: string;
  readonly outgoing: boolean;
  readonly actType: string;
  readonly declaration: string | null;
  readonly status: string;
  readonly cargo: readonly CargoItem[];
  readonly giftValueCoins: number;
  readonly createdTick: number;
  readonly etaTick: number;
  readonly ticksLeft: number;
  readonly deadlineTick: number;
  /**
   * True while a traveling envoy has arrived and waits for a leader.
   */
  readonly waiting: boolean;
  readonly failure: string | null;
  readonly returnTick: number | null;
};

/**
 * One trade agreement (query `agreements`).
 */
export type AgreementView = {
  readonly factionAId: EntityId;
  readonly factionAName: string;
  readonly factionBId: EntityId;
  readonly factionBName: string;
};

/**
 * One open proposal (query `proposals`).
 */
export type ProposalView = {
  readonly proposalId: number;
  readonly fromFactionId: EntityId;
  readonly fromName: string;
  readonly actType: string;
  readonly createdTick: number;
  readonly expiryTick: number;
  readonly ticksLeft: number;
};

function nameOf(engine: GameEngine, id: EntityId): string {
  const entity = engine.store.get(id);
  return (entity === undefined ? undefined : getComponent(entity, factionComponent))?.name ?? "";
}

/**
 * The diplomacy table: every faction except the player's government, ascending by id, with both
 * views of the standing, their bands, the agreement flag, the derived `hostile` status and the
 * envoys under way to or from it.
 *
 * @param engine - The engine.
 * @returns The rows; empty without a game.
 */
export function buildDiplomacyView(engine: GameEngine): DiplomacyFactionView[] {
  const government = governmentFactionId(engine);
  if (government === null) {
    return [];
  }
  const constants = engine.content.constants;
  const rows: DiplomacyFactionView[] = [];
  for (const entity of listFactions(engine)) {
    const faction = getComponent(entity, factionComponent);
    if (faction === undefined || entity.id === government) {
      continue;
    }
    const ours = getStanding(engine, government, entity.id);
    const theirs = getStanding(engine, entity.id, government);
    const leader = faction.leaderId === null ? undefined : engine.store.get(faction.leaderId);
    rows.push({
      factionId: entity.id,
      contentId: faction.contentId,
      name: faction.name,
      factionType: faction.factionType,
      disposition: faction.disposition,
      npc: isNpcFaction(engine, entity.id),
      leaderId: faction.leaderId,
      leaderName: leader === undefined ? null : styledName(engine, leader),
      seat: seatOf(engine, entity.id),
      travelTicks: travelTicks(engine, government, entity.id),
      ourStanding: ours.value,
      ourAttitude: attitudeOfValue(constants, ours.value),
      theirStanding: theirs.value,
      theirAttitude: attitudeOfValue(constants, theirs.value),
      tradeAgreement: ours.tradeAgreement || theirs.tradeAgreement,
      hostile: isHostilePair(engine, government, entity.id),
      envoysUnderWay: pendingEnvoysOf(engine, government).filter(
        (envoy) => getComponent(envoy, envoyComponent)?.targetFactionId === entity.id,
      ).length,
    });
  }
  return rows;
}

function viewOfEnvoy(engine: GameEngine, envoy: Entity, tick: number): EnvoyView | null {
  const data = getComponent(envoy, envoyComponent);
  if (data === undefined) {
    return null;
  }
  const government = governmentFactionId(engine);
  return {
    envoyId: envoy.id,
    senderFactionId: data.senderFactionId,
    senderName: nameOf(engine, data.senderFactionId),
    targetFactionId: data.targetFactionId,
    targetName: nameOf(engine, data.targetFactionId),
    outgoing: data.senderFactionId === government,
    actType: data.actType,
    declaration: data.declaration,
    status: data.status,
    cargo: data.cargo.map((item) => ({ ...item })),
    giftValueCoins: data.giftValueCoins,
    createdTick: data.creationTick,
    etaTick: data.arriveTick,
    ticksLeft: data.status === EnvoyStatus.Traveling ? Math.max(0, data.arriveTick - tick) : 0,
    deadlineTick: data.deadlineTick,
    waiting: data.status === EnvoyStatus.Traveling && tick >= data.arriveTick,
    failure: data.failure,
    returnTick: data.returnTick,
  };
}

/**
 * Every envoy on the way, delivering or going home (query `envoys`), ascending by entity id.
 *
 * @param engine - The engine.
 * @returns The rows.
 */
export function buildEnvoyViews(engine: GameEngine): EnvoyView[] {
  const tick = engine.time.tickCount;
  return listEnvoys(engine).flatMap((envoy) => {
    const view = viewOfEnvoy(engine, envoy, tick);
    return view === null ? [] : [view];
  });
}

/**
 * The player's pending directives (query `directives`): the envoys the settlement sent and that
 * still exist, with ETA, deadline and what they carry; `CancelDiplomaticDirective` cancels one that
 * is still traveling.
 *
 * @param engine - The engine.
 * @returns The rows, ascending by envoy id.
 */
export function buildDirectiveViews(engine: GameEngine): EnvoyView[] {
  return buildEnvoyViews(engine).filter((view) => view.outgoing);
}

/**
 * The trade agreements (query `agreements`).
 *
 * @param engine - The engine.
 * @returns One row per pair.
 */
export function buildAgreementViews(engine: GameEngine): AgreementView[] {
  return listAgreements(engine).map((agreement) => ({
    ...agreement,
    factionAName: nameOf(engine, agreement.factionAId),
    factionBName: nameOf(engine, agreement.factionBId),
  }));
}

/**
 * The proposals that wait for the player's answer (query `proposals`).
 *
 * @param engine - The engine.
 * @returns The rows, ascending by proposal id.
 */
export function buildProposalViews(engine: GameEngine): ProposalView[] {
  const tick = engine.time.tickCount;
  return getDiplomacyService(engine)
    .proposals()
    .map((proposal) => ({
      proposalId: proposal.proposalId,
      fromFactionId: proposal.fromFactionId,
      fromName: nameOf(engine, proposal.fromFactionId),
      actType: proposal.actType,
      createdTick: proposal.createdTick,
      expiryTick: proposal.expiryTick,
      ticksLeft: Math.max(0, proposal.expiryTick - tick),
    }));
}
