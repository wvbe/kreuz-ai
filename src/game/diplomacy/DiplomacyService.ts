import { z } from "zod";
import { cloneJson } from "../ecs/jsonData";
import type { EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { DiplomaticActType } from "./diplomacyTypes";
import type { NpcActRecord, Proposal } from "./diplomacyTypes";

const idSchema = z.number().int().min(1);
const tickSchema = z.number().int().min(0);

const proposalSchema = z
  .object({
    proposalId: idSchema,
    fromFactionId: idSchema,
    actType: z.enum(DiplomaticActType),
    createdTick: tickSchema,
    expiryTick: tickSchema,
  })
  .strict();

const sectionSchema = z
  .object({
    nextProposalId: idSchema,
    proposals: z.array(proposalSchema),
    npcActs: z.array(z.object({ factionId: idSchema, lastActTick: tickSchema }).strict()),
  })
  .strict()
  .refine(
    (data) =>
      data.proposals.every(
        (proposal, index) =>
          proposal.proposalId < data.nextProposalId &&
          (index === 0 || (data.proposals[index - 1]?.proposalId ?? 0) < proposal.proposalId),
      ),
    { message: "proposals must be unique, ascending and below nextProposalId" },
  )
  .refine(
    (data) =>
      data.npcActs.every(
        (record, index) =>
          index === 0 || (data.npcActs[index - 1]?.factionId ?? 0) < record.factionId,
      ),
    { message: "npcActs must be unique and ascending by factionId" },
  );

/**
 * Per-engine diplomacy state that is not on entities: the proposals that wait for the player's
 * answer, the tick each NPC faction last started an act (cooldown) and the proposal id counter,
 * saved in the section `systems.diplomacy`. It also holds the difficulty's hostility multiplier
 * (derived from the game options on every init, never saved).
 */
export class DiplomacyService {
  private proposalList: Proposal[] = [];
  private nextId = 1;
  private actRecords: NpcActRecord[] = [];
  private hostilityMilli = 1000;

  /**
   * The factor (permille) that scales the negative deltas and hostile acts of NPC factions toward
   * the player (`factionHostilityMultiplier` of the difficulty, spec 027 FR-015).
   *
   * @returns Permille, 1000 for steady.
   */
  hostilityMultiplierMilli(): number {
    return this.hostilityMilli;
  }

  /**
   * Sets the hostility multiplier (called on every `newGame` / `loadGame` init).
   *
   * @param permille - Permille, 1000 = 1.0.
   */
  setHostilityMultiplierMilli(permille: number): void {
    this.hostilityMilli = permille;
  }

  /**
   * Queues a proposal for the player.
   *
   * @param fromFactionId - The proposing NPC faction.
   * @param actType - Overture or trade agreement.
   * @param tick - The current tick.
   * @param expiryTick - Tick after which it lapses.
   * @returns A copy of the new proposal.
   */
  addProposal(
    fromFactionId: EntityId,
    actType: DiplomaticActType,
    tick: number,
    expiryTick: number,
  ): Proposal {
    const proposal: Proposal = {
      proposalId: this.nextId,
      fromFactionId,
      actType,
      createdTick: tick,
      expiryTick,
    };
    this.nextId += 1;
    this.proposalList.push(proposal);
    return { ...proposal };
  }

  /**
   * Looks a proposal up.
   *
   * @param proposalId - Proposal id.
   * @returns A copy, or null when it is gone.
   */
  findProposal(proposalId: number): Proposal | null {
    const found = this.proposalList.find((proposal) => proposal.proposalId === proposalId);
    return found === undefined ? null : { ...found };
  }

  /**
   * The open proposals, ascending by id.
   *
   * @returns Copies.
   */
  proposals(): Proposal[] {
    return this.proposalList.map((proposal) => ({ ...proposal }));
  }

  /**
   * Removes a proposal (answered or lapsed).
   *
   * @param proposalId - Proposal id.
   * @returns The removed proposal, or null when it was gone.
   */
  removeProposal(proposalId: number): Proposal | null {
    const found = this.findProposal(proposalId);
    this.proposalList = this.proposalList.filter((proposal) => proposal.proposalId !== proposalId);
    return found;
  }

  /**
   * Remembers that an NPC faction started an act.
   *
   * @param factionId - The NPC faction.
   * @param tick - The tick of the act.
   */
  recordNpcAct(factionId: EntityId, tick: number): void {
    const others = this.actRecords.filter((record) => record.factionId !== factionId);
    this.actRecords = [...others, { factionId, lastActTick: tick }].sort(
      (left, right) => left.factionId - right.factionId,
    );
  }

  /**
   * The tick an NPC faction last started an act.
   *
   * @param factionId - The NPC faction.
   * @returns The tick, or null when it never did.
   */
  lastNpcAct(factionId: EntityId): number | null {
    return this.actRecords.find((record) => record.factionId === factionId)?.lastActTick ?? null;
  }

  /**
   * Forgets everything about a faction that no longer exists.
   *
   * @param factionId - The deleted faction.
   * @returns The proposals that came from it (removed).
   */
  forgetFaction(factionId: EntityId): Proposal[] {
    const removed = this.proposalList.filter((proposal) => proposal.fromFactionId === factionId);
    this.proposalList = this.proposalList.filter(
      (proposal) => proposal.fromFactionId !== factionId,
    );
    this.actRecords = this.actRecords.filter((record) => record.factionId !== factionId);
    return removed.map((proposal) => ({ ...proposal }));
  }

  /**
   * The save section `systems.diplomacy`.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "diplomacy",
      location: SaveSectionLocation.Systems,
      schema: sectionSchema,
      serialize: () => ({
        nextProposalId: this.nextId,
        proposals: this.proposalList.map((proposal) => cloneJson(proposal)),
        npcActs: this.actRecords.map((record) => cloneJson(record)),
      }),
      restore: (saved: JsonValue) => {
        const parsed = sectionSchema.parse(saved);
        this.nextId = parsed.nextProposalId;
        this.proposalList = parsed.proposals;
        this.actRecords = parsed.npcActs;
      },
      defaultForOlderSaves: () => ({ nextProposalId: 1, proposals: [], npcActs: [] }),
    };
  }
}
