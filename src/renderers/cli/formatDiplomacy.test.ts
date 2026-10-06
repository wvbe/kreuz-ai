import { describe, expect, it } from "vitest";
import {
  formatAgreements,
  formatDiplomacy,
  formatEnvoys,
  formatProposals,
} from "./formatDiplomacy";

const faction = {
  factionId: 12,
  contentId: "ashford_barony",
  name: "Barony of Ashford",
  factionType: "political",
  disposition: "aggressive",
  npc: true,
  leaderId: 13,
  leaderName: "Hugh Ashford, Baron of the Barony of Ashford",
  travelTicks: 71,
  ourStanding: -5,
  ourAttitude: "wary",
  theirStanding: -40,
  theirAttitude: "hostile",
  tradeAgreement: false,
  hostile: true,
  envoysUnderWay: 1,
};

const envoy = {
  envoyId: 30,
  senderName: "Settlement",
  targetFactionId: 12,
  targetName: "Barony of Ashford",
  outgoing: true,
  actType: "gift",
  declaration: null,
  status: "traveling",
  cargo: [{ materialId: "silver_penny", quantity: 100 }],
  etaTick: 90,
  ticksLeft: 71,
  deadlineTick: 595,
  waiting: false,
  failure: null,
  returnTick: null,
};

describe("formatDiplomacy", () => {
  it("shows both standings with their bands, flags and the leader", () => {
    expect(formatDiplomacy([faction])).toEqual([
      "faction #12 Barony of Ashford (political, aggressive), 71 ticks away: HOSTILE, 1 envoy(s) under way",
      "  we see them -5 (wary), they see us -40 (hostile); leader #13 Hugh Ashford, Baron of the Barony of Ashford",
    ]);
  });

  it("shows an agreement and a leaderless faction", () => {
    const lines = formatDiplomacy([
      {
        ...faction,
        hostile: false,
        envoysUnderWay: 0,
        tradeAgreement: true,
        leaderId: null,
        leaderName: null,
        travelTicks: null,
      },
    ]);
    expect(lines[0]).toBe("faction #12 Barony of Ashford (political, aggressive): trade agreement");
    expect(lines[1]).toContain("no leader");
  });

  it("says so when there are no other factions and ignores a foreign view", () => {
    expect(formatDiplomacy([])).toEqual(["no other factions are known"]);
    expect(formatDiplomacy("nope")).toEqual([]);
  });
});

describe("formatEnvoys", () => {
  it("describes an envoy under way with its ETA, deadline and cargo", () => {
    expect(formatEnvoys([envoy], "none")).toEqual([
      "envoy #30 gift to #12 Barony of Ashford, carrying 100 silver_penny: traveling, arrives at tick 90 (71 ticks), gives up at tick 595",
    ]);
  });

  it("describes a waiting envoy, a declaration, a delivered and a failed trip", () => {
    const lines = formatEnvoys(
      [
        { ...envoy, waiting: true, cargo: [] },
        { ...envoy, envoyId: 31, actType: "declaration", declaration: "war", cargo: [] },
        { ...envoy, envoyId: 32, status: "delivered", returnTick: 200 },
        { ...envoy, envoyId: 33, status: "returning", failure: "unreachable", returnTick: 700 },
        { ...envoy, envoyId: 34, outgoing: false, senderName: "Abbey" },
      ],
      "none",
    );
    expect(lines[0]).toContain("waiting for a leader, gives up at tick 595");
    expect(lines[1]).toContain("declaration (war)");
    expect(lines[2]).toContain("delivered, home at tick 200");
    expect(lines[3]).toContain("failed (unreachable), home at tick 700");
    expect(lines[4]).toContain("from Abbey");
  });

  it("uses the note for an empty list and ignores a foreign view", () => {
    expect(formatEnvoys([], "no envoys on the way")).toEqual(["no envoys on the way"]);
    expect(formatEnvoys(3, "x")).toEqual([]);
  });
});

describe("formatAgreements", () => {
  it("names both sides of each agreement", () => {
    expect(
      formatAgreements([
        { factionAId: 1, factionAName: "Settlement", factionBId: 14, factionBName: "Abbey" },
      ]),
    ).toEqual(["trade agreement: #1 Settlement and #14 Abbey"]);
  });

  it("explains how to get one and ignores a foreign view", () => {
    expect(formatAgreements([])).toEqual(["no trade agreements (envoy <faction> agreement)"]);
    expect(formatAgreements(null)).toEqual([]);
  });
});

describe("formatProposals", () => {
  it("shows the proposal and how to answer it", () => {
    expect(
      formatProposals([
        {
          proposalId: 2,
          fromFactionId: 14,
          fromName: "Abbey",
          actType: "trade-agreement",
          ticksLeft: 500,
          expiryTick: 900,
        },
      ]),
    ).toEqual([
      "proposal #2: Abbey (#14) offers trade-agreement, lapses at tick 900 (500 ticks); answer with respond 2 accept|reject|counter",
    ]);
  });

  it("says so when there are none and ignores a foreign view", () => {
    expect(formatProposals([])).toEqual(["no open proposals"]);
    expect(formatProposals("x")).toEqual([]);
  });
});
