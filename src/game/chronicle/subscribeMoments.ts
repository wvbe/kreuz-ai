import { z } from "zod";
import { FactionType, NotableMomentKind } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { isMember } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { factionLeaderChangedEvent, factionMembershipChangedEvent } from "../factions/factionTypes";
import { residentsOf } from "../housing/household";
import { dwellingUpgradedEvent } from "../housing/housingTypes";
import { identityComponent } from "../identity/identityComponent";
import { identityTitleChangedEvent, TitleRank } from "../identity/identityTypes";
import { milestoneReachedEvent, tierReachedEvent } from "../settlement/settlementTypes";
import { skillIncreasedEvent, skillWorkCompletedEvent } from "../skills/skillTypes";
import {
  StewardVacancyReason,
  stewardAppointedEvent,
  stewardDismissedEvent,
} from "../standing/standingTypes";
import { tradeCompletedEvent } from "../trade/tradeTypes";
import { recheckName } from "./recheckName";
import { recordMoment } from "./recordMoment";
import { refreshFinest, trackFinest } from "./trackFinest";

const idSchema = z.number().int().min(1);
const titleSchema = z
  .object({
    skillId: z.string(),
    rank: z.enum(TitleRank),
    noun: z.string(),
    guildId: z.string().nullable(),
  })
  .nullable();
const titleChangedSchema = z.object({
  entityId: idSchema,
  oldTitle: titleSchema,
  newTitle: titleSchema,
});
const skillSchema = z.object({ entityId: idSchema, skillId: z.string(), newValue: z.number() });
const workSchema = z.object({ entityId: idSchema, skillId: z.string() });
const membershipSchema = z.object({ entityId: idSchema, factionId: idSchema, joined: z.boolean() });
const leaderSchema = z.object({
  factionId: idSchema,
  oldLeaderId: idSchema.nullable(),
  newLeaderId: idSchema.nullable(),
});
const stewardSchema = z.object({
  entityId: idSchema,
  reason: z.enum(StewardVacancyReason).optional(),
});
const tradeSchema = z.object({ buyerId: idSchema, sellerId: idSchema });
const dwellingSchema = z.object({ dwellingId: idSchema, toLevel: z.string() });
const tierSchema = z.object({ tier: z.string(), previousTier: z.string() });
const milestoneSchema = z.object({ milestone: z.string() });

function onTitleChanged(engine: GameEngine, payload: z.infer<typeof titleChangedSchema>): void {
  const { entityId, oldTitle, newTitle } = payload;
  if (newTitle === null) {
    return;
  }
  if (newTitle.rank === TitleRank.Master) {
    recordMoment(engine, {
      kind: NotableMomentKind.MasteryAchieved,
      entityId,
      params: { skillId: newTitle.skillId, noun: newTitle.noun, guildId: newTitle.guildId ?? "" },
    });
  } else if (oldTitle === null || oldTitle.rank === TitleRank.Practitioner) {
    recordMoment(engine, {
      kind: NotableMomentKind.TitleEarned,
      entityId,
      params: { skillId: newTitle.skillId, noun: newTitle.noun },
    });
  }
}

function onFirstWork(engine: GameEngine, entityId: EntityId, skillId: string): void {
  const entity = engine.store.get(entityId);
  const identity = entity === undefined ? undefined : getComponent(entity, identityComponent);
  if (identity === undefined || identity.seenSkills.includes(skillId)) {
    return;
  }
  const record = recordMoment(engine, {
    kind: NotableMomentKind.FirstWork,
    entityId,
    params: { skillId },
  });
  if (record !== null) {
    identity.seenSkills = [...identity.seenSkills, skillId].sort();
  }
}

function onFirstTrade(engine: GameEngine, entityId: EntityId, partnerId: EntityId): void {
  const entity = engine.store.get(entityId);
  const identity = entity === undefined ? undefined : getComponent(entity, identityComponent);
  if (identity === undefined || identity.tradeSeen) {
    return;
  }
  if (
    recordMoment(engine, {
      kind: NotableMomentKind.FirstTrade,
      entityId,
      params: { partnerId },
    }) !== null
  ) {
    identity.tradeSeen = true;
  }
}

function onMembership(engine: GameEngine, payload: z.infer<typeof membershipSchema>): void {
  const { entityId, factionId, joined } = payload;
  const government = governmentFactionId(engine);
  if (government === null) {
    return;
  }
  if (factionId === government) {
    if (joined) {
      recheckName(engine, entityId);
      recordMoment(engine, { kind: NotableMomentKind.Arrived, entityId, params: {} });
    } else {
      refreshFinest(engine);
    }
    return;
  }
  const entity = engine.store.get(factionId);
  const faction = entity === undefined ? undefined : getComponent(entity, factionComponent);
  if (
    faction?.factionType !== FactionType.Occupational ||
    !isMember(engine, entityId, government)
  ) {
    return;
  }
  recordMoment(engine, {
    kind: joined ? NotableMomentKind.JoinedGuild : NotableMomentKind.LeftGuild,
    entityId,
    params: { factionId, guildName: faction.name },
  });
}

function officeOf(engine: GameEngine, factionId: EntityId): string {
  const entity = engine.store.get(factionId);
  const title =
    entity === undefined ? "" : (getComponent(entity, factionComponent)?.leaderTitle ?? "");
  return title === "" ? "leader" : title;
}

/**
 * Subscribes the moment sources to the bus (spec 028 FR-013): each handler runs in the slot-20
 * drain of the tick its event happened and records through `recordMoment`, which keeps the
 * citizen and prominence rules:
 * - `faction.membership.changed` (joining the player government: the name re-check and `Arrived`;
 *   leaving it: the finest table is refreshed; an occupational faction: `JoinedGuild`,
 *   `LeftGuild`);
 * - `identity.title.changed` (`TitleEarned`, `MasteryAchieved`);
 * - `skill.increased` (the finest table: `BecameFinest`, `LostFinest`) and `skill.work.completed`
 *   (`FirstWork`, once per skill, kept in `Identity.seenSkills`);
 * - `trade.completed` (`FirstTrade` for each party, once, `Identity.tradeSeen`);
 * - `faction.leader.changed`, `steward.appointed`, `steward.dismissed` (`TookOffice`,
 *   `LostOffice`; a Steward who died gets none);
 * - `housing.dwelling.upgraded` (`HomeImproved` for each resident);
 * - `settlement.milestone.reached` and `settlement.tier.reached` (`SettlementMilestone`,
 *   `TierReached`);
 * - `entity.deleted` (the finest table is refreshed; `Died` itself is recorded by the delete hook,
 *   see `registerDeathHook`).
 *
 * The subscriptions belong to the engine's bus; nothing is saved. Call once per engine.
 *
 * @param engine - The engine.
 */
export function subscribeMoments(engine: GameEngine): void {
  engine.bus.subscribe(factionMembershipChangedEvent, (payload) => {
    const parsed = membershipSchema.safeParse(payload);
    if (parsed.success) {
      onMembership(engine, parsed.data);
    }
  });
  engine.bus.subscribe(identityTitleChangedEvent, (payload) => {
    const parsed = titleChangedSchema.safeParse(payload);
    if (parsed.success) {
      onTitleChanged(engine, parsed.data);
    }
  });
  engine.bus.subscribe(skillIncreasedEvent, (payload) => {
    const parsed = skillSchema.safeParse(payload);
    if (parsed.success) {
      trackFinest(engine, parsed.data.entityId, parsed.data.skillId, parsed.data.newValue);
    }
  });
  engine.bus.subscribe(skillWorkCompletedEvent, (payload) => {
    const parsed = workSchema.safeParse(payload);
    if (parsed.success) {
      onFirstWork(engine, parsed.data.entityId, parsed.data.skillId);
    }
  });
  engine.bus.subscribe(tradeCompletedEvent, (payload) => {
    const parsed = tradeSchema.safeParse(payload);
    if (parsed.success) {
      onFirstTrade(engine, parsed.data.buyerId, parsed.data.sellerId);
      onFirstTrade(engine, parsed.data.sellerId, parsed.data.buyerId);
    }
  });
  engine.bus.subscribe(factionLeaderChangedEvent, (payload) => {
    const parsed = leaderSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }
    const { factionId, oldLeaderId, newLeaderId } = parsed.data;
    const office = officeOf(engine, factionId);
    if (oldLeaderId !== null) {
      recordMoment(engine, {
        kind: NotableMomentKind.LostOffice,
        entityId: oldLeaderId,
        params: { factionId, office },
      });
    }
    if (newLeaderId !== null) {
      recordMoment(engine, {
        kind: NotableMomentKind.TookOffice,
        entityId: newLeaderId,
        params: { factionId, office },
      });
    }
  });
  engine.bus.subscribe(stewardAppointedEvent, (payload) => {
    const parsed = stewardSchema.safeParse(payload);
    const government = governmentFactionId(engine);
    if (parsed.success && government !== null) {
      recordMoment(engine, {
        kind: NotableMomentKind.TookOffice,
        entityId: parsed.data.entityId,
        params: { factionId: government, office: engine.content.nameFormats.stewardTitle },
      });
    }
  });
  engine.bus.subscribe(stewardDismissedEvent, (payload) => {
    const parsed = stewardSchema.safeParse(payload);
    const government = governmentFactionId(engine);
    if (parsed.success && government !== null && parsed.data.reason !== StewardVacancyReason.Died) {
      recordMoment(engine, {
        kind: NotableMomentKind.LostOffice,
        entityId: parsed.data.entityId,
        params: { factionId: government, office: engine.content.nameFormats.stewardTitle },
      });
    }
  });
  engine.bus.subscribe(dwellingUpgradedEvent, (payload) => {
    const parsed = dwellingSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }
    for (const resident of residentsOf(engine, parsed.data.dwellingId)) {
      recordMoment(engine, {
        kind: NotableMomentKind.HomeImproved,
        entityId: resident.id,
        params: { dwellingId: parsed.data.dwellingId, dwellingLevel: parsed.data.toLevel },
      });
    }
  });
  engine.bus.subscribe(milestoneReachedEvent, (payload) => {
    const parsed = milestoneSchema.safeParse(payload);
    if (parsed.success) {
      recordMoment(engine, {
        kind: NotableMomentKind.SettlementMilestone,
        entityId: null,
        params: { milestone: parsed.data.milestone },
      });
    }
  });
  engine.bus.subscribe(tierReachedEvent, (payload) => {
    const parsed = tierSchema.safeParse(payload);
    if (parsed.success) {
      recordMoment(engine, {
        kind: NotableMomentKind.TierReached,
        entityId: null,
        params: { tier: parsed.data.tier, previousTier: parsed.data.previousTier },
      });
    }
  });
  engine.bus.subscribe("entity.deleted", () => {
    refreshFinest(engine);
  });
}
