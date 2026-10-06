import { z } from "zod";
import { MilestoneKind } from "../content/contentTypes";
import { agreementFormedEvent } from "../diplomacy/diplomacyTypes";
import type { GameEngine } from "../engine/GameEngine";
import { factionLeaderChangedEvent, factionMembershipChangedEvent } from "../factions/factionTypes";
import { isMember } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { identityTitleChangedEvent, TitleRank } from "../identity/identityTypes";
import { zoneRequirementsMetEvent } from "../zones/zoneTypes";
import { foundedGuilds } from "./foundedGuilds";
import { recordMilestone } from "./recordMilestone";
import {
  dwellingUpgradedEvent,
  marketZoneTypeId,
  throneRoomZoneTypeId,
  worshipZoneTypeIds,
} from "./settlementTypes";

const idSchema = z.number().int().min(1);
const zoneMetSchema = z.object({ zoneId: idSchema, zoneTypeId: z.string() });
const titleSchema = z.object({
  entityId: idSchema,
  newTitle: z.object({ rank: z.string() }).nullable(),
});
const agreementSchema = z.object({ factionAId: idSchema, factionBId: idSchema });
const dwellingSchema = z.object({ dwellingId: idSchema.optional() });

function checkGuilds(engine: GameEngine): void {
  const first = foundedGuilds(engine)[0];
  if (first !== undefined) {
    recordMilestone(engine, MilestoneKind.FirstGuildFounded, [first]);
  }
}

/**
 * Subscribes the milestone detectors to the bus (spec 027 FR-019, FR-020). Each runs in the slot-20
 * drain of the tick the event happened (not daily) and calls `recordMilestone`, which keeps the
 * first occurrence only:
 * - `zone.requirements.met` of a throne room, a chapel or church, or a market;
 * - `faction.membership.changed` / `faction.leader.changed` when a guild becomes founded;
 * - `identity.title.changed` to the rank Master for a settlement member;
 * - `diplomacy.agreement.formed` that involves the government;
 * - `housing.dwelling.upgraded` (emitted by the housing task; the dwelling is the subject).
 *
 * The subscriptions belong to the engine's bus, which lives as long as the engine; nothing is
 * saved. Call once per engine.
 *
 * @param engine - The engine.
 */
export function subscribeMilestones(engine: GameEngine): void {
  engine.bus.subscribe(zoneRequirementsMetEvent, (payload) => {
    const parsed = zoneMetSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }
    const { zoneId, zoneTypeId } = parsed.data;
    if (zoneTypeId === throneRoomZoneTypeId) {
      recordMilestone(engine, MilestoneKind.ThroneRoomEstablished, [zoneId]);
    } else if (worshipZoneTypeIds.includes(zoneTypeId)) {
      recordMilestone(engine, MilestoneKind.FirstWorshipSpace, [zoneId]);
    } else if (zoneTypeId === marketZoneTypeId) {
      recordMilestone(engine, MilestoneKind.FirstMarket, [zoneId]);
    }
  });
  engine.bus.subscribe(factionMembershipChangedEvent, () => {
    checkGuilds(engine);
  });
  engine.bus.subscribe(factionLeaderChangedEvent, () => {
    checkGuilds(engine);
  });
  engine.bus.subscribe(identityTitleChangedEvent, (payload) => {
    const parsed = titleSchema.safeParse(payload);
    const government = governmentFactionId(engine);
    if (
      parsed.success &&
      parsed.data.newTitle?.rank === TitleRank.Master &&
      government !== null &&
      isMember(engine, parsed.data.entityId, government)
    ) {
      recordMilestone(engine, MilestoneKind.FirstMasterCraftsman, [parsed.data.entityId]);
    }
  });
  engine.bus.subscribe(agreementFormedEvent, (payload) => {
    const parsed = agreementSchema.safeParse(payload);
    const government = governmentFactionId(engine);
    if (
      parsed.success &&
      government !== null &&
      (parsed.data.factionAId === government || parsed.data.factionBId === government)
    ) {
      const partner =
        parsed.data.factionAId === government ? parsed.data.factionBId : parsed.data.factionAId;
      recordMilestone(engine, MilestoneKind.FirstTradeAgreement, [partner]);
    }
  });
  engine.bus.subscribe(dwellingUpgradedEvent, (payload) => {
    const parsed = dwellingSchema.safeParse(payload);
    const dwellingId = parsed.success ? parsed.data.dwellingId : undefined;
    recordMilestone(
      engine,
      MilestoneKind.FirstDwellingUpgrade,
      dwellingId === undefined ? [] : [dwellingId],
    );
  });
}
