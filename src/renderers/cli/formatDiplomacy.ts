import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const itemSchema = z.object({ materialId: z.string(), quantity: z.number() });

const factionSchema = z.object({
  factionId: z.number(),
  contentId: z.string().nullable(),
  name: z.string(),
  factionType: z.string(),
  disposition: z.string(),
  npc: z.boolean(),
  leaderId: z.number().nullable(),
  leaderName: z.string().nullable(),
  travelTicks: z.number().nullable(),
  ourStanding: z.number(),
  ourAttitude: z.string(),
  theirStanding: z.number(),
  theirAttitude: z.string(),
  tradeAgreement: z.boolean(),
  hostile: z.boolean(),
  envoysUnderWay: z.number(),
});

const envoySchema = z.object({
  envoyId: z.number(),
  senderName: z.string(),
  targetFactionId: z.number(),
  targetName: z.string(),
  outgoing: z.boolean(),
  actType: z.string(),
  declaration: z.string().nullable(),
  status: z.string(),
  cargo: z.array(itemSchema),
  etaTick: z.number(),
  ticksLeft: z.number(),
  deadlineTick: z.number(),
  waiting: z.boolean(),
  failure: z.string().nullable(),
  returnTick: z.number().nullable(),
});

const agreementSchema = z.object({
  factionAId: z.number(),
  factionAName: z.string(),
  factionBId: z.number(),
  factionBName: z.string(),
});

const proposalSchema = z.object({
  proposalId: z.number(),
  fromFactionId: z.number(),
  fromName: z.string(),
  actType: z.string(),
  ticksLeft: z.number(),
  expiryTick: z.number(),
});

/**
 * Formats the `factions-diplomacy` query for the `diplomacy` verb: one line per faction with the
 * settlement's standing toward it and its standing toward the settlement (each with the band), the
 * agreement, the leader and the envoys under way, `hostile` flagged.
 *
 * @param view - Data of the `factions-diplomacy` query.
 * @returns Output lines; a note when there are no other factions; empty for a foreign view.
 */
export function formatDiplomacy(view: JsonValue): string[] {
  const parsed = z.array(factionSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no other factions are known"];
  }
  return parsed.data.flatMap((row) => {
    const flags = [
      row.tradeAgreement ? "trade agreement" : null,
      row.hostile ? "HOSTILE" : null,
      row.envoysUnderWay > 0 ? `${row.envoysUnderWay} envoy(s) under way` : null,
    ].filter((flag) => flag !== null);
    const leader =
      row.leaderId === null ? "no leader" : `leader #${row.leaderId} ${row.leaderName ?? ""}`;
    const trip = row.travelTicks === null ? "" : `, ${row.travelTicks} ticks away`;
    return [
      `faction #${row.factionId} ${row.name} (${row.factionType}, ${row.disposition})${trip}${flags.length === 0 ? "" : `: ${flags.join(", ")}`}`,
      `  we see them ${row.ourStanding} (${row.ourAttitude}), they see us ${row.theirStanding} (${row.theirAttitude}); ${leader}`,
    ];
  });
}

function items(list: readonly { materialId: string; quantity: number }[]): string {
  return list.map((item) => `${item.quantity} ${item.materialId}`).join(", ");
}

/**
 * Formats the `directives` or `envoys` query: one line per envoy with its act, the way it goes,
 * its ETA or why it is going home.
 *
 * @param view - Data of the `directives` or `envoys` query.
 * @param empty - The note for an empty list.
 * @returns Output lines; empty for a foreign view.
 */
export function formatEnvoys(view: JsonValue, empty: string): string[] {
  const parsed = z.array(envoySchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return [empty];
  }
  return parsed.data.map((envoy) => {
    const act =
      envoy.declaration === null ? envoy.actType : `${envoy.actType} (${envoy.declaration})`;
    const route = envoy.outgoing
      ? `to #${envoy.targetFactionId} ${envoy.targetName}`
      : `from ${envoy.senderName}`;
    const carrying = envoy.cargo.length === 0 ? "" : `, carrying ${items(envoy.cargo)}`;
    const state =
      envoy.status === "traveling"
        ? envoy.waiting
          ? `waiting for a leader, gives up at tick ${envoy.deadlineTick}`
          : `arrives at tick ${envoy.etaTick} (${envoy.ticksLeft} ticks), gives up at tick ${envoy.deadlineTick}`
        : envoy.failure === null
          ? `delivered, home at tick ${envoy.returnTick}`
          : `failed (${envoy.failure}), home at tick ${envoy.returnTick}`;
    return `envoy #${envoy.envoyId} ${act} ${route}${carrying}: ${envoy.status}, ${state}`;
  });
}

/**
 * Formats the `agreements` query for the `agreements` verb.
 *
 * @param view - Data of the `agreements` query.
 * @returns Output lines; a note when there are none; empty for a foreign view.
 */
export function formatAgreements(view: JsonValue): string[] {
  const parsed = z.array(agreementSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no trade agreements (envoy <faction> agreement)"];
  }
  return parsed.data.map(
    (agreement) =>
      `trade agreement: #${agreement.factionAId} ${agreement.factionAName} and #${agreement.factionBId} ${agreement.factionBName}`,
  );
}

/**
 * Formats the `proposals` query for the `proposals` verb.
 *
 * @param view - Data of the `proposals` query.
 * @returns Output lines; a note when there are none; empty for a foreign view.
 */
export function formatProposals(view: JsonValue): string[] {
  const parsed = z.array(proposalSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no open proposals"];
  }
  return parsed.data.map(
    (proposal) =>
      `proposal #${proposal.proposalId}: ${proposal.fromName} (#${proposal.fromFactionId}) offers ${proposal.actType}, lapses at tick ${proposal.expiryTick} (${proposal.ticksLeft} ticks); answer with respond ${proposal.proposalId} accept|reject|counter`,
  );
}
