import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { setFactionLeader } from "../factions/factionLeader";
import { joinFaction, leaveFaction, membersOf } from "../factions/factionMembership";
import { getStanding } from "../factions/factionStanding";
import { getTotal } from "../inventory/inventoryQueries";
import { DiplomaticActType, DispatchFailureReason, EnvoyStatus } from "./diplomacyTypes";
import { envoyComponent } from "./envoyComponent";
import { dispatchAct } from "./envoys";
import type { ActRequest } from "./envoys";
import { cancelEnvoy, failEnvoy, onEnvoyDeleted } from "./envoyTrips";
import { createDiplomacyWorld } from "./testDiplomacyWorld";
import type { DiplomacyTestWorld } from "./testDiplomacyWorld";

const gift = (giftCoins: number): ActRequest => ({
  actType: DiplomaticActType.Gift,
  declaration: null,
  giftCoins,
  giftItems: [],
});

function leaderIdOf(world: DiplomacyTestWorld, factionId: number): number | null {
  const faction = world.engine.store.require(factionId).components["Faction"] as {
    leaderId: number | null;
  };
  return faction.leaderId;
}

/**
 * Leaves a faction without leader and members, and (for an NPC faction) without a seat, so that
 * neither the succession rule nor the heir rule can give it a leader again.
 */
function strand(world: DiplomacyTestWorld, factionId: number): void {
  setFactionLeader(world.engine, factionId, null);
  const faction = world.engine.store.require(factionId).components["Faction"] as {
    seat: null;
  };
  faction.seat = null;
  for (const member of membersOf(world.engine, factionId)) {
    leaveFaction(world.engine, member.id, factionId);
  }
}

function send(world: DiplomacyTestWorld, targetId: number, coins = 100) {
  const envoy = dispatchAct(
    world.engine,
    world.government,
    targetId,
    gift(coins),
    world.engine.time.tickCount,
  );
  const data = getComponent(envoy, envoyComponent);
  if (data === undefined) {
    throw new Error("no envoy data");
  }
  return { envoy, data };
}

describe("runEnvoys", () => {
  it("waits for arriveTick, then delivers the gift to the leader, applies standing and heads home", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const delivered = world.record("diplomacy.message.delivered");
    const resolved = world.record("diplomacy.act.resolved");
    const { envoy, data } = send(world, abbey);
    world.run(data.arriveTick - 1);
    expect(data.status).toBe(EnvoyStatus.Traveling);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(25);
    world.run(1);
    expect(data.status).toBe(EnvoyStatus.Delivered);
    expect(data.returnTick).toBe(data.arriveTick + data.travelTicks);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(35);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(25);
    const leader = world.engine.store.require(leaderIdOf(world, abbey) ?? 0);
    expect(getTotal(leader, "silver_penny")).toBe(100);
    expect(getTotal(envoy, "silver_penny")).toBe(0);
    expect(data.cargo).toEqual([]);
    world.engine.bus.processQueue();
    expect(delivered).toContainEqual({
      envoyId: envoy.id,
      senderFactionId: world.government,
      targetFactionId: abbey,
      actType: "gift",
    });
    expect(resolved).toContainEqual({
      envoyId: envoy.id,
      senderFactionId: world.government,
      targetFactionId: abbey,
      actType: "gift",
      accepted: true,
    });
  });

  it("removes the envoy when it is home", () => {
    const world = createDiplomacyWorld();
    const { envoy, data } = send(world, world.npc("wulfric_abbey"));
    world.run(data.arriveTick + data.travelTicks - 1);
    expect(world.engine.store.has(envoy.id)).toBe(true);
    world.run(1);
    expect(world.engine.store.has(envoy.id)).toBe(false);
  });

  it("hands the message to a leader who was appointed while it was on the way", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const { data } = send(world, abbey);
    const first = leaderIdOf(world, abbey) ?? 0;
    const heir = world.engine.store
      .entities()
      .find(
        (entity) =>
          entity.id !== first &&
          (entity.components["Citizen"] as { factions: number[] } | undefined)?.factions.includes(
            abbey,
          ),
      );
    setFactionLeader(world.engine, abbey, heir?.id ?? 0);
    world.run(data.arriveTick);
    expect(getTotal(world.engine.store.require(heir?.id ?? 0), "silver_penny")).toBe(100);
    expect(getTotal(world.engine.store.require(first), "silver_penny")).toBe(0);
  });

  it("waits at a leaderless faction and delivers when a leader is named", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const { data } = send(world, abbey);
    strand(world, abbey);
    world.run(data.arriveTick + 10);
    expect(data.status).toBe(EnvoyStatus.Traveling);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(25);
    const newcomer = world.settler(5);
    joinFaction(world.engine, newcomer.id, abbey);
    setFactionLeader(world.engine, abbey, newcomer.id);
    world.run(1);
    expect(data.status).toBe(EnvoyStatus.Delivered);
    expect(getTotal(newcomer, "silver_penny")).toBeGreaterThanOrEqual(100);
  });

  it("fails with leader-unavailable at the deadline when nobody can receive it, and refunds the gift", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const failed = world.record("diplomacy.dispatch.failed");
    const before = world.treasury();
    const { envoy, data } = send(world, abbey);
    expect(world.treasury()).toBe(before - 100);
    strand(world, abbey);
    world.run(data.deadlineTick);
    expect(data.status).toBe(EnvoyStatus.Returning);
    expect(data.failure).toBe(DispatchFailureReason.LeaderUnavailable);
    expect(world.treasury()).toBe(before);
    // the act was not applied (the standing only decayed by a point on day 2)
    expect(getStanding(world.engine, abbey, world.government).value).toBe(24);
    world.engine.bus.processQueue();
    expect(failed).toEqual([
      {
        envoyId: envoy.id,
        senderFactionId: world.government,
        targetFactionId: abbey,
        reason: "leader-unavailable",
      },
    ]);
  });

  it("times out as unreachable when the trip takes longer than envoyStuckTimeoutTicks", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const failed = world.record("diplomacy.dispatch.failed");
    const before = world.treasury();
    const { data } = send(world, abbey);
    data.arriveTick = data.deadlineTick + 500;
    world.run(data.deadlineTick - 1);
    expect(data.status).toBe(EnvoyStatus.Traveling);
    world.run(1);
    expect(data.status).toBe(EnvoyStatus.Returning);
    expect(data.failure).toBe(DispatchFailureReason.Unreachable);
    expect(data.returnTick).toBe(data.deadlineTick + data.travelTicks);
    expect(world.treasury()).toBe(before);
    // the act was not applied (the standing only decayed by a point on day 2)
    expect(getStanding(world.engine, abbey, world.government).value).toBe(24);
    world.engine.bus.processQueue();
    expect(failed.map((entry) => (entry as { reason: string }).reason)).toEqual(["unreachable"]);
  });

  it("recalls an envoy whose target faction was destroyed", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const before = world.treasury();
    const { data } = send(world, abbey);
    world.run(5);
    world.engine.store.requestDelete(abbey);
    world.run(2);
    expect(data.status).toBe(EnvoyStatus.Returning);
    expect(data.failure).toBe(DispatchFailureReason.LeaderUnavailable);
    expect(world.treasury()).toBe(before);
  });

  it("still delivers when the sender's leader dies after the dispatch", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const { data } = send(world, abbey);
    world.engine.store.requestDelete(leaderIdOf(world, world.government) ?? 0);
    world.run(data.arriveTick);
    expect(data.status).toBe(EnvoyStatus.Delivered);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(35);
  });

  it("delivers an NPC proposal to the player's leader as a proposal, not as a change", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const received = world.record("diplomacy.proposal.received");
    const envoy = dispatchAct(
      world.engine,
      abbey,
      world.government,
      { actType: DiplomaticActType.TradeAgreement, declaration: null, giftCoins: 0, giftItems: [] },
      0,
    );
    const data = getComponent(envoy, envoyComponent);
    world.run((data?.arriveTick ?? 0) + 1);
    world.engine.bus.processQueue();
    expect(received).toHaveLength(1);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(25);
    expect(world.query("proposals")).toHaveLength(1);
  });

  it("gives up an envoy for a leaderless player faction at the deadline too", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const envoy = dispatchAct(
      world.engine,
      abbey,
      world.government,
      { actType: DiplomaticActType.Overture, declaration: null, giftCoins: 0, giftItems: [] },
      0,
    );
    const data = getComponent(envoy, envoyComponent);
    strand(world, world.government);
    world.run((data?.deadlineTick ?? 0) + 1);
    expect(data?.failure).toBe(DispatchFailureReason.LeaderUnavailable);
  });
});

describe("failEnvoy", () => {
  it("queues the failure, refunds the cargo and sends the envoy home without applying the act", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const failed = world.record("diplomacy.dispatch.failed");
    const before = world.treasury();
    const { envoy, data } = send(world, abbey, 40);
    failEnvoy(world.engine, envoy, DispatchFailureReason.Unreachable, 9);
    world.engine.bus.processQueue();
    expect(world.treasury()).toBe(before);
    expect(data).toMatchObject({
      status: EnvoyStatus.Returning,
      failure: "unreachable",
      returnTick: 9 + data.travelTicks,
    });
    expect(failed).toHaveLength(1);
  });
});

describe("onEnvoyDeleted", () => {
  it("reports envoy-destroyed and refunds when a traveling envoy is deleted by something else", () => {
    const world = createDiplomacyWorld();
    const failed = world.record("diplomacy.dispatch.failed");
    const before = world.treasury();
    const { envoy } = send(world, world.npc("wulfric_abbey"));
    world.engine.store.requestDelete(envoy.id);
    world.run(1);
    expect(world.treasury()).toBe(before);
    expect(failed.map((entry) => (entry as { reason: string }).reason)).toEqual([
      "envoy-destroyed",
    ]);
  });

  it("ignores an envoy that is home or delivered", () => {
    const world = createDiplomacyWorld();
    const failed = world.record("diplomacy.dispatch.failed");
    const { envoy, data } = send(world, world.npc("wulfric_abbey"));
    data.status = EnvoyStatus.Delivered;
    onEnvoyDeleted(world.engine, envoy);
    world.engine.bus.processQueue();
    expect(failed).toEqual([]);
  });
});

describe("cancelEnvoy", () => {
  it("refunds the gift, queues the cancellation and removes the envoy at once", () => {
    const world = createDiplomacyWorld();
    const cancelled = world.record("diplomacy.directive.cancelled");
    const failed = world.record("diplomacy.dispatch.failed");
    const before = world.treasury();
    const { envoy } = send(world, world.npc("wulfric_abbey"));
    expect(cancelEnvoy(world.engine, envoy)).toBe(true);
    world.run(1);
    expect(world.engine.store.has(envoy.id)).toBe(false);
    expect(world.treasury()).toBe(before);
    expect(cancelled).toHaveLength(1);
    expect(failed).toEqual([]);
  });

  it("refuses an envoy that has delivered", () => {
    const world = createDiplomacyWorld();
    const { envoy, data } = send(world, world.npc("wulfric_abbey"));
    world.run(data.arriveTick);
    expect(cancelEnvoy(world.engine, envoy)).toBe(false);
  });
});
