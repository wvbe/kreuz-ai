import { describe, expect, it } from "vitest";
import {
  formatLedger,
  formatOffers,
  formatOrders,
  formatQuote,
  formatTraders,
  formatTreasury,
} from "./formatTrade";

const trader = {
  entityId: 11,
  prototypeId: "trader_caravan",
  factionId: 10,
  phase: "Present",
  mapId: 1,
  cellIndex: 282,
  arrivedTick: 894,
  departTick: 1470,
  coins: 400,
  stock: [
    { materialId: "coal", quantity: 20 },
    { materialId: "nails", quantity: 60 },
  ],
  buys: ["iron_ore", "limestone"],
  refines: [],
  standing: 3,
  tradeAgreement: true,
};

describe("formatTraders", () => {
  it("describes each caravan and the visit schedule", () => {
    const lines = formatTraders({
      traders: [trader],
      visits: [{ traderPrototypeId: "trader_caravan", entityId: 11, nextArrivalTick: null }],
    });
    expect(lines).toEqual([
      "trader #11 trader_caravan Present at 1:282, leaves at tick 1470: 400 coins, standing 3 (trade agreement)",
      "  sells 20 coal, 60 nails",
      "  buys iron_ore, limestone",
      "trader_caravan: caravan #11 is on the map",
    ]);
  });

  it("says so when nobody is here and shows the next arrival", () => {
    expect(
      formatTraders({
        traders: [],
        visits: [{ traderPrototypeId: "trader_caravan", entityId: null, nextArrivalTick: 900 }],
      }),
    ).toEqual(["no trader is here", "trader_caravan: next caravan at tick 900"]);
  });

  it("returns nothing for a foreign view", () => {
    expect(formatTraders("nope")).toEqual([]);
  });
});

describe("formatOrders", () => {
  const order = {
    orderId: 2,
    traderPrototypeId: "trader_caravan",
    direction: "Sell",
    materialId: "iron_ore",
    quantity: 10,
    remaining: 4,
    coins: 14,
    status: "Open",
    failures: 1,
    waitingFor: "NoStock",
    reason: null,
  };

  it("shows progress, money and what an open order waits for", () => {
    expect(formatOrders([order])).toEqual([
      "order #2 sell iron_ore 6/10 with trader_caravan: Open, earned 14 coins, 1 failed, waiting: NoStock",
    ]);
  });

  it("shows why a closed order ended", () => {
    expect(
      formatOrders([
        {
          ...order,
          direction: "Buy",
          status: "Cancelled",
          failures: 0,
          waitingFor: null,
          reason: "too_many_failures",
        },
      ]),
    ).toEqual([
      "order #2 buy iron_ore 6/10 with trader_caravan: Cancelled, spent 14 coins, too_many_failures",
    ]);
  });

  it("explains how to start when there are none", () => {
    expect(formatOrders([])[0]).toContain("trade sell|buy");
    expect(formatOrders({})).toEqual([]);
  });
});

describe("formatOffers", () => {
  it("lists open offers with counters", () => {
    expect(
      formatOffers([
        {
          offerId: 3,
          round: 2,
          status: "Countered",
          buyerId: 4,
          sellerId: 11,
          requested: [{ materialId: "nails", quantity: 10 }],
          offered: [{ materialId: "iron_ore", quantity: 1 }],
          coins: 2,
          counterCoins: 3,
          expiryTick: 120,
        },
      ]),
    ).toEqual([
      "offer #3 round 2 Countered: #4 asks 10 nails from #11 for 2 coins and 1 iron_ore, counter 3 coins, expires at tick 120",
    ]);
    expect(formatOffers([])).toEqual(["no open offers"]);
    expect(formatOffers(5)).toEqual([]);
  });
});

describe("formatLedger and formatTreasury", () => {
  it("shows the credit in whole units and the rule", () => {
    expect(
      formatLedger([
        {
          traderPrototypeId: "trader_caravan",
          refinedMaterialId: "iron_ingot",
          rawMaterialId: "iron_ore",
          ratioMilli: 500,
          creditMilli: 5500,
          units: 5,
        },
      ]),
    ).toEqual(["trader_caravan: 5 iron_ingot may still be bought, credit 5.5 (iron_ore x 0.5)"]);
    expect(formatLedger([])[0]).toContain("no refined credit");
    expect(formatLedger(null)).toEqual([]);
  });

  it("shows the balance and the queued wages", () => {
    expect(
      formatTreasury({
        balance: 12,
        pendingWages: [{ paymentId: 4, workerId: 7, amount: 2 }],
      }),
    ).toEqual(["treasury: 12 coins", "  wage #4 of 2 coins for #7 is waiting"]);
    expect(formatTreasury([])).toEqual([]);
  });
});

describe("formatQuote", () => {
  const quote = {
    direction: "Buy",
    materialId: "nails",
    quantity: 10,
    coins: 3,
    ceilingCoins: 3,
    available: 60,
    reason: null,
  };

  it("quotes a purchase and a sale", () => {
    expect(formatQuote(quote)).toEqual(["10 nails, buy from the trader: 3 coins, 60 available"]);
    expect(
      formatQuote({
        ...quote,
        direction: "Sell",
        materialId: "iron_ore",
        coins: 23,
        ceilingCoins: 25,
        available: 400,
      }),
    ).toEqual([
      "10 iron_ore, sell to the trader: 23 coins (up to 25 after a counter), trader has 400 coins",
    ]);
  });

  it("says why a trade is not possible, or that the entity is no trader", () => {
    expect(formatQuote({ ...quote, available: 0, reason: "not-sold" })[0]).toContain(
      "not possible (not-sold)",
    );
    expect(formatQuote(null)).toEqual(["that entity is not a trader"]);
    expect(formatQuote("x")).toEqual([]);
    expect(formatQuote({ ...quote, coins: null })[0]).toContain("no value");
  });
});
