import { getComponent } from "../ecs/Entity";
import type { FactionContent } from "../content/schemas/characterSchemas";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { governmentFactionId, listFactions } from "../factions/factionRegistry";
import { getStanding } from "../factions/factionStanding";
import { hasAgreement } from "./agreements";
import { DiplomacyError } from "./DiplomacyError";
import { getDiplomacyService } from "./diplomacyServiceRegistry";
import {
  DeclarationKind,
  DiplomaticActType,
  EnvoyStatus,
  diplomacyAiStreamName,
} from "./diplomacyTypes";
import { envoyComponent } from "./envoyComponent";
import { dispatchAct, listEnvoys } from "./envoys";
import type { ActRequest } from "./envoys";
import { applyIncident } from "./applyIncident";
import { isNpcFaction } from "./standingRules";

/**
 * The `npc` block of the content faction an entity is bound to.
 *
 * @param engine - The engine.
 * @param faction - A faction entity.
 * @returns The block, or undefined for a faction without one.
 */
export function npcRecordOf(engine: GameEngine, faction: Entity): FactionContent["npc"] {
  const contentId = getComponent(faction, factionComponent)?.contentId ?? null;
  return contentId === null ? undefined : engine.content.factions.find(contentId)?.npc;
}

/**
 * What the NPC AI may do on one evaluation (D-14, D-56).
 */
export enum NpcAction {
  Overture = "overture",
  Agreement = "agreement",
  Incident = "incident",
}

/**
 * The weighted choices an NPC faction has toward the player on one evaluation, from the weights
 * of its `npc` block and its standing toward the settlement (D-56):
 * - overture: standing from `overtureMinStanding` below `agreementMinStanding`, no proposal or
 *   envoy of its own already under way;
 * - agreement: standing at least `agreementMinStanding`, no agreement, nothing under way;
 * - incident: standing below `friendlyStanding`, its weight scaled by the hostility multiplier.
 *
 * @param engine - The engine.
 * @param faction - The NPC faction entity.
 * @param governmentId - The player's government.
 * @returns The actions with positive weight, in a fixed order.
 */
export function npcChoices(
  engine: GameEngine,
  faction: Entity,
  governmentId: number,
): { action: NpcAction; weight: number }[] {
  const record = npcRecordOf(engine, faction);
  if (record === undefined) {
    return [];
  }
  const constants = engine.content.constants;
  const service = getDiplomacyService(engine);
  const value = getStanding(engine, faction.id, governmentId).value;
  const busy =
    service.proposals().some((proposal) => proposal.fromFactionId === faction.id) ||
    listEnvoys(engine).some((envoy) => {
      const message = getComponent(envoy, envoyComponent);
      return (
        message?.senderFactionId === faction.id &&
        message.status === EnvoyStatus.Traveling &&
        message.actType !== DiplomaticActType.Declaration
      );
    });
  const choices: { action: NpcAction; weight: number }[] = [];
  if (
    !busy &&
    record.overtureWeight > 0 &&
    value >= constants.overtureMinStanding &&
    value < constants.agreementMinStanding
  ) {
    choices.push({ action: NpcAction.Overture, weight: record.overtureWeight });
  }
  if (
    !busy &&
    record.agreementWeight > 0 &&
    value >= constants.agreementMinStanding &&
    !hasAgreement(engine, faction.id, governmentId)
  ) {
    choices.push({ action: NpcAction.Agreement, weight: record.agreementWeight });
  }
  const incident = Math.floor((record.incidentWeight * service.hostilityMultiplierMilli()) / 1000);
  if (incident > 0 && value < constants.friendlyStanding) {
    choices.push({ action: NpcAction.Incident, weight: incident });
  }
  return choices;
}

function request(actType: DiplomaticActType, declaration: DeclarationKind | null): ActRequest {
  return { actType, declaration, giftCoins: 0, giftItems: [] };
}

function evaluate(engine: GameEngine, faction: Entity, governmentId: number, tick: number): void {
  const record = npcRecordOf(engine, faction);
  if (record === undefined) {
    return;
  }
  const constants = engine.content.constants;
  const service = getDiplomacyService(engine);
  const stream = engine.prng.stream(diplomacyAiStreamName);
  const value = getStanding(engine, faction.id, governmentId).value;
  const send = (actType: DiplomaticActType, declaration: DeclarationKind | null): void => {
    try {
      dispatchAct(engine, faction.id, governmentId, request(actType, declaration), tick);
      service.recordNpcAct(faction.id, tick);
    } catch (failure) {
      if (!(failure instanceof DiplomacyError)) {
        throw failure;
      }
    }
  };
  if (record.warLike && value <= -20 && value > constants.warThreshold) {
    const chance = Math.min(
      1000,
      Math.floor((constants.warChance * service.hostilityMultiplierMilli()) / 1000),
    );
    if (stream.chancePermille(chance)) {
      send(DiplomaticActType.Declaration, DeclarationKind.War);
      return;
    }
  }
  const choices = npcChoices(engine, faction, governmentId);
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  if (total < 1) {
    return;
  }
  let pick = stream.nextBelow(total);
  for (const choice of choices) {
    if (pick < choice.weight) {
      if (choice.action === NpcAction.Overture) {
        send(DiplomaticActType.Overture, null);
      } else if (choice.action === NpcAction.Agreement) {
        send(DiplomaticActType.TradeAgreement, null);
      } else if (
        stream.chancePermille(
          Math.min(
            1000,
            Math.floor((constants.incidentChance * service.hostilityMultiplierMilli()) / 1000),
          ),
        )
      ) {
        applyIncident(engine, faction.id, governmentId);
        service.recordNpcAct(faction.id, tick);
      }
      return;
    }
    pick -= choice.weight;
  }
}

/**
 * The NPC faction AI (spec 021 FR-012, D-14, D-56), run in slot 11: every NPC faction evaluates
 * once per `npcEvalIntervalTicks` (72) on the tick where `tick mod 72 == factionId mod 72`, when
 * it has a leader and its last act is `npcActCooldownTicks` (288) old, so it starts at most one act
 * per cooldown. A war-like faction at standing -20 or lower (above war) declares war with chance
 * `warChance` x the hostility multiplier; otherwise one of {@link npcChoices} is drawn by weight
 * from the stream `diplomacy.ai`. An overture or agreement is sent by an envoy to the player's
 * leader; an incident (insult) happens at once and passes a chance gate of `incidentChance` x the
 * multiplier. Draws happen only when something can be done, so a quiet world uses no randomness.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The number of NPC factions that evaluated.
 */
export function runNpcFactions(engine: GameEngine, tick: number): number {
  const constants = engine.content.constants;
  const governmentId = governmentFactionId(engine);
  if (governmentId === null) {
    return 0;
  }
  const service = getDiplomacyService(engine);
  let evaluated = 0;
  for (const faction of listFactions(engine)) {
    const data = getComponent(faction, factionComponent);
    if (
      data === undefined ||
      !isNpcFaction(engine, faction.id) ||
      data.leaderId === null ||
      tick % constants.npcEvalIntervalTicks !== faction.id % constants.npcEvalIntervalTicks
    ) {
      continue;
    }
    const last = service.lastNpcAct(faction.id);
    if (last !== null && tick - last < constants.npcActCooldownTicks) {
      continue;
    }
    evaluated += 1;
    evaluate(engine, faction, governmentId, tick);
  }
  return evaluated;
}
