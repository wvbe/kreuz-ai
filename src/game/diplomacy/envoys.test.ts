import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { setFactionLeader } from "../factions/factionLeader";
import { setStanding } from "../factions/factionStanding";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { getTotal } from "../inventory/inventoryQueries";
import { storeUpTo } from "../inventory/inventoryOperations";
import { setAgreement } from "./agreements";
import { DiplomacyError, DiplomacyErrorKind } from "./DiplomacyError";
import { DeclarationKind, DiplomaticActType, EnvoyStatus } from "./diplomacyTypes";
import { envoyComponent } from "./envoyComponent";
import {
  dispatchAct,
  giftValueCoins,
  listEnvoys,
  pendingEnvoysOf,
  refundCargo,
  validateDispatch,
} from "./envoys";
import type { ActRequest } from "./envoys";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

const gift = (giftCoins: number, giftItems: ActRequest["giftItems"] = []): ActRequest => ({
  actType: DiplomaticActType.Gift,
  declaration: null,
  giftCoins,
  giftItems,
});
const overture: ActRequest = {
  actType: DiplomaticActType.Overture,
  declaration: null,
  giftCoins: 0,
  giftItems: [],
};
const agreement: ActRequest = { ...overture, actType: DiplomaticActType.TradeAgreement };

function refusal(run: () => void): DiplomacyErrorKind | null {
  try {
    run();
  } catch (failure) {
    if (failure instanceof DiplomacyError) {
      return failure.kind;
    }
    throw failure;
  }
  return null;
}

// @covers 021:FR-005 021:FR-010 021:FR-011 021:SC-004
describe("giftValueCoins", () => {
  it("counts coins at face value and goods at their value, rounded down", () => {
    const world = createDiplomacyWorld();
    const bread = world.engine.materials.require("bread").valueMilli ?? 0;
    expect(giftValueCoins(world.engine, 10, [])).toBe(10);
    expect(giftValueCoins(world.engine, 10, [{ materialId: "bread", quantity: 7 }])).toBe(
      10 + Math.floor((bread * 7) / 1000),
    );
  });
});

describe("validateDispatch", () => {
  it("accepts a plain overture", () => {
    const world = createDiplomacyWorld();
    expect(
      refusal(() =>
        validateDispatch(world.engine, world.government, world.npc("wulfric_abbey"), overture),
      ),
    ).toBeNull();
  });

  it("refuses an unknown faction, a self target and a faction without a seat", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    expect(refusal(() => validateDispatch(world.engine, world.government, 9999, overture))).toBe(
      DiplomacyErrorKind.UnknownFaction,
    );
    expect(refusal(() => validateDispatch(world.engine, 9999, abbey, overture))).toBe(
      DiplomacyErrorKind.UnknownFaction,
    );
    expect(
      refusal(() => validateDispatch(world.engine, world.government, world.government, overture)),
    ).toBe(DiplomacyErrorKind.SelfTarget);
    const guild = world.engine.store.spawn("faction", {
      Faction: { contentId: "guild_bakers", name: "Guild" },
    });
    expect(
      refusal(() => validateDispatch(world.engine, world.government, guild.id, overture)),
    ).toBe(DiplomacyErrorKind.NoSeat);
  });

  it("refuses a gift without cargo, cargo on another act, and a declaration without subtype", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    expect(refusal(() => validateDispatch(world.engine, world.government, abbey, gift(0)))).toBe(
      DiplomacyErrorKind.InvalidAct,
    );
    expect(
      refusal(() =>
        validateDispatch(world.engine, world.government, abbey, { ...overture, giftCoins: 5 }),
      ),
    ).toBe(DiplomacyErrorKind.InvalidAct);
    expect(
      refusal(() =>
        validateDispatch(world.engine, world.government, abbey, {
          ...overture,
          actType: DiplomaticActType.Declaration,
        }),
      ),
    ).toBe(DiplomacyErrorKind.InvalidAct);
    expect(
      refusal(() =>
        validateDispatch(world.engine, world.government, abbey, {
          ...overture,
          declaration: DeclarationKind.War,
        }),
      ),
    ).toBe(DiplomacyErrorKind.InvalidAct);
  });

  it("refuses when the target has no leader", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    setFactionLeader(world.engine, abbey, null);
    expect(refusal(() => validateDispatch(world.engine, world.government, abbey, overture))).toBe(
      DiplomacyErrorKind.TargetLeaderless,
    );
  });

  it("refuses a trade agreement to a hostile faction or when one stands", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    setStanding(world.engine, baron, world.government, -31);
    expect(refusal(() => validateDispatch(world.engine, world.government, baron, agreement))).toBe(
      DiplomacyErrorKind.HostileGate,
    );
    // an overture and a gift are still allowed: they are how standing recovers
    expect(
      refusal(() => validateDispatch(world.engine, world.government, baron, overture)),
    ).toBeNull();
    expect(
      refusal(() => validateDispatch(world.engine, world.government, baron, gift(10))),
    ).toBeNull();
    const abbey = world.npc("wulfric_abbey");
    setAgreement(world.engine, world.government, abbey, true);
    expect(refusal(() => validateDispatch(world.engine, world.government, abbey, agreement))).toBe(
      DiplomacyErrorKind.AgreementExists,
    );
  });

  it("refuses a gift the treasury cannot pay and goods it does not hold", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    expect(
      refusal(() =>
        validateDispatch(world.engine, world.government, abbey, gift(world.treasury() + 1)),
      ),
    ).toBe(DiplomacyErrorKind.InsufficientFunds);
    expect(
      refusal(() =>
        validateDispatch(
          world.engine,
          world.government,
          abbey,
          gift(0, [{ materialId: "bread", quantity: 1 }]),
        ),
      ),
    ).toBe(DiplomacyErrorKind.InsufficientFunds);
    expect(
      refusal(() =>
        validateDispatch(world.engine, world.government, abbey, gift(world.treasury())),
      ),
    ).toBeNull();
  });

  it("allows only the settlement to send a gift", () => {
    const world = createDiplomacyWorld();
    expect(
      refusal(() =>
        validateDispatch(world.engine, world.npc("wulfric_abbey"), world.government, gift(5)),
      ),
    ).toBe(DiplomacyErrorKind.InvalidAct);
  });

  it("bounds the envoys a faction may have under way (maxEnvoysPerFaction)", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const limit = world.engine.content.constants.maxEnvoysPerFaction;
    for (let count = 0; count < limit; count += 1) {
      dispatchAct(world.engine, world.government, abbey, overture, 0);
    }
    expect(refusal(() => validateDispatch(world.engine, world.government, abbey, overture))).toBe(
      DiplomacyErrorKind.TooManyEnvoys,
    );
  });
});

describe("dispatchAct", () => {
  it("moves the gift into the envoy, queues the events and sets the trip", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const initiated = world.record("diplomacy.act.initiated");
    const started = world.record("diplomacy.dispatch.started");
    const before = world.treasury();
    world.run(3);
    const envoy = dispatchAct(world.engine, world.government, abbey, gift(100), 3);
    world.engine.bus.processQueue();
    const data = getComponent(envoy, envoyComponent);
    expect(world.treasury()).toBe(before - 100);
    expect(getTotal(envoy, "silver_penny")).toBe(100);
    expect(data).toMatchObject({
      senderFactionId: world.government,
      targetFactionId: abbey,
      actType: "gift",
      cargo: [{ materialId: "silver_penny", quantity: 100 }],
      giftValueCoins: 100,
      creationTick: 3,
      status: EnvoyStatus.Traveling,
      returnTick: null,
      failure: null,
      deadlineTick: 3 + 576,
    });
    // the abbey is 71 ticks away (D-56) plus a jitter of at most 12
    expect(data?.travelTicks).toBeGreaterThanOrEqual(71);
    expect(data?.travelTicks).toBeLessThanOrEqual(83);
    expect(data?.arriveTick).toBe(3 + (data?.travelTicks ?? 0));
    expect(initiated).toEqual([
      { senderFactionId: world.government, targetFactionId: abbey, actType: "gift" },
    ]);
    expect(started).toEqual([
      {
        envoyId: envoy.id,
        senderFactionId: world.government,
        targetFactionId: abbey,
        actType: "gift",
      },
    ]);
  });

  it("draws the jitter from the stream diplomacy.resolve: same seed, same trip", () => {
    const trip = (seed: number): number => {
      const world = createDiplomacyWorld({ seed });
      const envoy = dispatchAct(
        world.engine,
        world.government,
        world.npc("wulfric_abbey"),
        overture,
        0,
      );
      return getComponent(envoy, envoyComponent)?.travelTicks ?? 0;
    };
    expect(trip(11)).toBe(trip(11));
  });

  it("carries goods from the treasury inventory and merges them with coins", () => {
    const world = createDiplomacyWorld();
    const treasury = world.engine.store.require(world.government);
    storeUpTo({ materials: world.engine.materials, actor: null }, treasury, "bread", 6);
    const envoy = dispatchAct(
      world.engine,
      world.government,
      world.npc("wulfric_abbey"),
      gift(50, [{ materialId: "bread", quantity: 4 }]),
      0,
    );
    expect(getTotal(treasury, "bread")).toBe(2);
    expect(getComponent(envoy, envoyComponent)?.cargo).toEqual([
      { materialId: "bread", quantity: 4 },
      { materialId: "silver_penny", quantity: 50 },
    ]);
  });
});

describe("listEnvoys and pendingEnvoysOf", () => {
  it("lists envoys ascending, pending ones by sender, and drops the ones about to be deleted", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const first = dispatchAct(world.engine, world.government, abbey, overture, 0);
    const second = dispatchAct(world.engine, world.government, abbey, gift(5), 0);
    expect(listEnvoys(world.engine).map((entity) => entity.id)).toEqual([first.id, second.id]);
    expect(pendingEnvoysOf(world.engine, world.government)).toHaveLength(2);
    expect(pendingEnvoysOf(world.engine, abbey)).toHaveLength(0);
    world.engine.store.requestDelete(first.id);
    expect(listEnvoys(world.engine).map((entity) => entity.id)).toEqual([second.id]);
    const data = getComponent(second, envoyComponent);
    if (data !== undefined) {
      data.status = EnvoyStatus.Returning;
    }
    expect(pendingEnvoysOf(world.engine, world.government)).toHaveLength(0);
  });
});

describe("refundCargo", () => {
  it("gives the cargo back to the treasury and empties the record", () => {
    const world = createDiplomacyWorld();
    const before = world.treasury();
    const envoy = dispatchAct(
      world.engine,
      world.government,
      world.npc("wulfric_abbey"),
      gift(120),
      0,
    );
    expect(refundCargo(world.engine, envoy)).toEqual([
      { materialId: "silver_penny", quantity: 120 },
    ]);
    expect(world.treasury()).toBe(before);
    expect(getComponent(envoy, envoyComponent)?.cargo).toEqual([]);
    expect(refundCargo(world.engine, envoy)).toEqual([]);
  });

  it("drops what the treasury cannot take as a loose pile at the seat", () => {
    const world = createDiplomacyWorld();
    const envoy = dispatchAct(
      world.engine,
      world.government,
      world.npc("wulfric_abbey"),
      gift(120),
      0,
    );
    world.engine.store.removeComponent(world.government, inventoryComponent);
    const result = refundCargo(world.engine, envoy);
    expect(result).toEqual([{ materialId: "silver_penny", quantity: 120 }]);
    const pile = world.engine.store.entities().find((entity) => entity.prototype === "loose_pile");
    expect(pile).toBeDefined();
    expect(getTotal(pile ?? envoy, "silver_penny")).toBe(120);
    expect(pile?.components["Position"]).toMatchObject({ cellIndex: 55 });
  });
});
