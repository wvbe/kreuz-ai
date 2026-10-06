import { describe, expect, it } from "vitest";
import { getStanding } from "../factions/factionStanding";
import { hasAgreement } from "./agreements";
import { DiplomacyErrorKind } from "./DiplomacyError";
import type { DiplomacyError } from "./DiplomacyError";
import { getDiplomacyService } from "./diplomacyServiceRegistry";
import { DiplomaticActType, ProposalResponse } from "./diplomacyTypes";
import { expireProposals, receiveProposal, respondToProposal } from "./proposals";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

describe("receiveProposal", () => {
  it("stores the proposal with its expiry and queues diplomacy.proposal.received", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const received = world.record("diplomacy.proposal.received");
    const proposal = receiveProposal(world.engine, abbey, DiplomaticActType.TradeAgreement, 100);
    world.engine.bus.processQueue();
    expect(proposal).toMatchObject({ proposalId: 1, createdTick: 100, expiryTick: 100 + 576 });
    expect(received).toEqual([
      { proposalId: 1, fromFactionId: abbey, actType: "trade-agreement", payload: {} },
    ]);
    expect(getDiplomacyService(world.engine).proposals()).toHaveLength(1);
  });
});

describe("respondToProposal", () => {
  it("accept forms the agreement: +10 both ways and the flag", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const responded = world.record("diplomacy.proposal.responded");
    receiveProposal(world.engine, abbey, DiplomaticActType.TradeAgreement, 0);
    respondToProposal(world.engine, 1, ProposalResponse.Accept);
    world.engine.bus.processQueue();
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(true);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(35);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(30);
    expect(responded).toEqual([
      { proposalId: 1, fromFactionId: abbey, actType: "trade-agreement", response: "accept" },
    ]);
    expect(getDiplomacyService(world.engine).proposals()).toEqual([]);
  });

  it("accepting an overture is +5 both ways without an agreement", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    receiveProposal(world.engine, abbey, DiplomaticActType.Overture, 0);
    respondToProposal(world.engine, 1, ProposalResponse.Accept);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(30);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
  });

  it("reject costs the settlement's view of the proposer the rejection penalty (3)", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    receiveProposal(world.engine, abbey, DiplomaticActType.TradeAgreement, 0);
    respondToProposal(world.engine, 1, ProposalResponse.Reject);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(17);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(25);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
  });

  it("counter closes the proposal without a standing change", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    receiveProposal(world.engine, abbey, DiplomaticActType.TradeAgreement, 0);
    respondToProposal(world.engine, 1, ProposalResponse.Counter);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(20);
    expect(getDiplomacyService(world.engine).proposals()).toEqual([]);
  });

  it("refuses an unknown or already answered proposal", () => {
    const world = createDiplomacyWorld();
    receiveProposal(world.engine, world.npc("wulfric_abbey"), DiplomaticActType.Overture, 0);
    respondToProposal(world.engine, 1, ProposalResponse.Reject);
    for (const id of [1, 99]) {
      try {
        respondToProposal(world.engine, id, ProposalResponse.Accept);
        throw new Error("expected a refusal");
      } catch (failure) {
        expect((failure as DiplomacyError).kind).toBe(DiplomacyErrorKind.UnknownProposal);
      }
    }
  });
});

describe("expireProposals", () => {
  it("drops proposals at their expiry tick and queues proposal.expired, ascending", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const expired = world.record("diplomacy.proposal.expired");
    receiveProposal(world.engine, abbey, DiplomaticActType.Overture, 0);
    receiveProposal(world.engine, abbey, DiplomaticActType.TradeAgreement, 100);
    expect(expireProposals(world.engine, 575)).toBe(0);
    expect(expireProposals(world.engine, 576)).toBe(1);
    expect(expireProposals(world.engine, 676)).toBe(1);
    world.engine.bus.processQueue();
    expect(expired.map((entry) => (entry as { proposalId: number }).proposalId)).toEqual([1, 2]);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(20);
  });

  it("drops a proposal whose proposer no longer exists", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    receiveProposal(world.engine, abbey, DiplomaticActType.Overture, 0);
    world.engine.store.requestDelete(abbey);
    world.engine.store.flushDeletions();
    expect(expireProposals(world.engine, 1)).toBe(1);
  });
});
