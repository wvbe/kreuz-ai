import { describe, expect, it } from "vitest";
import { DiplomacyService } from "./DiplomacyService";
import { DiplomaticActType } from "./diplomacyTypes";

describe("DiplomacyService", () => {
  it("adds proposals with counter ids, finds them and lists them ascending", () => {
    const service = new DiplomacyService();
    const first = service.addProposal(5, DiplomaticActType.Overture, 10, 100);
    const second = service.addProposal(6, DiplomaticActType.TradeAgreement, 11, 101);
    expect([first.proposalId, second.proposalId]).toEqual([1, 2]);
    expect(service.findProposal(2)).toMatchObject({ fromFactionId: 6, expiryTick: 101 });
    expect(service.findProposal(9)).toBeNull();
    expect(service.proposals().map((proposal) => proposal.proposalId)).toEqual([1, 2]);
  });

  it("returns copies, never the live records", () => {
    const service = new DiplomacyService();
    service.addProposal(5, DiplomaticActType.Overture, 10, 100);
    const copy = service.proposals();
    copy[0] = { ...(copy[0] as (typeof copy)[number]), fromFactionId: 99 };
    expect(service.findProposal(1)?.fromFactionId).toBe(5);
  });

  it("removes a proposal once and never reuses its id", () => {
    const service = new DiplomacyService();
    service.addProposal(5, DiplomaticActType.Overture, 10, 100);
    expect(service.removeProposal(1)?.fromFactionId).toBe(5);
    expect(service.removeProposal(1)).toBeNull();
    expect(service.addProposal(5, DiplomaticActType.Overture, 20, 120).proposalId).toBe(2);
  });

  it("remembers the last act of each NPC faction, ascending by faction", () => {
    const service = new DiplomacyService();
    service.recordNpcAct(9, 50);
    service.recordNpcAct(4, 60);
    service.recordNpcAct(9, 70);
    expect(service.lastNpcAct(9)).toBe(70);
    expect(service.lastNpcAct(4)).toBe(60);
    expect(service.lastNpcAct(7)).toBeNull();
  });

  it("forgets a faction: its proposals and its cooldown", () => {
    const service = new DiplomacyService();
    service.addProposal(5, DiplomaticActType.Overture, 10, 100);
    service.addProposal(6, DiplomaticActType.Overture, 10, 100);
    service.recordNpcAct(5, 10);
    expect(service.forgetFaction(5).map((proposal) => proposal.proposalId)).toEqual([1]);
    expect(service.proposals().map((proposal) => proposal.fromFactionId)).toEqual([6]);
    expect(service.lastNpcAct(5)).toBeNull();
  });

  it("holds the hostility multiplier, 1000 by default", () => {
    const service = new DiplomacyService();
    expect(service.hostilityMultiplierMilli()).toBe(1000);
    service.setHostilityMultiplierMilli(250);
    expect(service.hostilityMultiplierMilli()).toBe(250);
  });

  it("round trips its section and rejects a broken one", () => {
    const service = new DiplomacyService();
    service.addProposal(5, DiplomaticActType.TradeAgreement, 10, 100);
    service.recordNpcAct(5, 12);
    const section = service.createSection();
    const saved = JSON.parse(JSON.stringify(section.serialize()));
    const restored = new DiplomacyService();
    restored.createSection().restore(saved);
    expect(restored.proposals()).toEqual(service.proposals());
    expect(restored.lastNpcAct(5)).toBe(12);
    expect(restored.addProposal(6, DiplomaticActType.Overture, 20, 200).proposalId).toBe(2);
    expect(() =>
      restored
        .createSection()
        .restore({ nextProposalId: 1, proposals: saved.proposals, npcActs: [] }),
    ).toThrow();
    expect(section.defaultForOlderSaves?.()).toEqual({
      nextProposalId: 1,
      proposals: [],
      npcActs: [],
    });
  });
});
