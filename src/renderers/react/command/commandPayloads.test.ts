import { describe, expect, it } from "vitest";
import {
  customJobCommand,
  envoyCommand,
  EnvoyAct,
  fieldErrorsOf,
  fieldErrorsOfError,
  isCommand,
  giftCommand,
  parseWhole,
  productionOrderCommand,
  standingOrderCommand,
  tradeCommand,
  TradeSide,
} from "./commandPayloads";
import type { PayloadResult } from "./commandPayloads";

function commandOf(result: PayloadResult) {
  if (!result.ok) {
    throw new Error(`expected a command, got ${JSON.stringify(result.errors)}`);
  }
  return result.command;
}

function errorsOf(result: PayloadResult) {
  if (result.ok) {
    throw new Error("expected errors");
  }
  return result.errors;
}

describe("parseWhole", () => {
  it("accepts whole numbers only", () => {
    expect(parseWhole(" 12 ")).toBe(12);
    expect(parseWhole("")).toBeNull();
    expect(parseWhole("-1")).toBeNull();
    expect(parseWhole("1.5")).toBeNull();
    expect(parseWhole("abc")).toBeNull();
  });
});

describe("fieldErrorsOfError", () => {
  it("maps issues to fields and keeps other errors as a general message", () => {
    expect(
      fieldErrorsOfError({
        kind: "invalid-payload",
        message: "bad",
        issues: ["quantity: Too small", "recipeId: Required"],
      } as never),
    ).toEqual({ quantity: "Too small", recipeId: "Required" });
    expect(fieldErrorsOfError({ kind: "unknown-command", message: "nope" } as never)).toEqual({
      "": "nope",
    });
  });
});

describe("standingOrderCommand", () => {
  const form = {
    materialId: "bread",
    recipeId: "",
    target: "20",
    threshold: "",
    priority: "",
    zoneId: "",
    boardId: "",
  };

  it("builds the minimal command and leaves empty optional fields out", () => {
    expect(commandOf(standingOrderCommand(form))).toEqual({
      kind: "CreateStandingOrder",
      materialId: "bread",
      targetQuantity: 20,
    });
  });

  it("carries recipe, threshold, priority, zone scope and board", () => {
    expect(
      commandOf(
        standingOrderCommand({
          ...form,
          recipeId: "bake_bread",
          threshold: "15",
          priority: "80",
          zoneId: "7",
          boardId: "2",
        }),
      ),
    ).toEqual({
      kind: "CreateStandingOrder",
      materialId: "bread",
      recipeId: "bake_bread",
      targetQuantity: 20,
      restockThreshold: 15,
      priority: 80,
      scope: { zoneId: 7 },
      postingBoardId: 2,
    });
  });

  it("reports every bad field", () => {
    expect(
      errorsOf(standingOrderCommand({ ...form, materialId: " ", target: "0", priority: "x" })),
    ).toEqual({
      materialId: "Choose a material",
      targetQuantity: "Must be at least 1",
      priority: "Enter a whole number",
    });
  });
});

describe("productionOrderCommand", () => {
  it("builds the order and requires a recipe, a workstation and a quantity", () => {
    expect(
      commandOf(
        productionOrderCommand({
          workstationId: "9",
          recipeId: "bake_bread",
          quantity: "5",
          priority: "",
        }),
      ),
    ).toEqual({
      kind: "CreateProductionOrder",
      recipeId: "bake_bread",
      workstationId: 9,
      quantity: 5,
    });
    expect(
      Object.keys(
        errorsOf(
          productionOrderCommand({ workstationId: "", recipeId: "", quantity: "0", priority: "" }),
        ),
      ),
    ).toEqual(["recipeId", "workstationId", "quantity"]);
  });
});

describe("customJobCommand", () => {
  it("builds PostCustomJob for a board that takes postings at once", () => {
    expect(
      commandOf(
        customJobCommand({
          boardId: 3,
          jobTypeId: "haul",
          mapId: 1,
          cell: "5",
          priority: "",
          wage: "2",
          direct: true,
        }),
      ),
    ).toEqual({
      kind: "PostCustomJob",
      boardId: 3,
      jobTypeId: "haul",
      mapId: 1,
      cellIndex: 5,
      wage: 2,
    });
  });

  it("builds PostJob for the board", () => {
    expect(
      commandOf(
        customJobCommand({
          boardId: 2,
          jobTypeId: "fell.trees",
          mapId: 1,
          cell: "296",
          priority: "60",
          wage: "",
          direct: false,
        }),
      ),
    ).toEqual({
      kind: "PostJob",
      boardId: 2,
      jobTypeId: "fell.trees",
      mapId: 1,
      cellIndex: 296,
      priority: 60,
    });
    expect(
      errorsOf(
        customJobCommand({
          boardId: 2,
          jobTypeId: "",
          mapId: 1,
          cell: "",
          priority: "",
          wage: "",
          direct: true,
        }),
      ),
    ).toEqual({
      jobTypeId: "Enter a job type",
      cellIndex: "Enter a whole number",
    });
  });
});

describe("giftCommand", () => {
  it("sends coins, goods or both in one act", () => {
    expect(
      commandOf(giftCommand({ factionId: 16, coins: "50", materialId: "", quantity: "" })),
    ).toEqual({
      kind: "IssueDiplomaticAct",
      actType: "gift",
      targetFactionId: 16,
      gift: { coins: 50, items: [] },
    });
    expect(
      commandOf(giftCommand({ factionId: 16, coins: "", materialId: "bread", quantity: "4" })),
    ).toMatchObject({
      gift: { coins: 0, items: [{ materialId: "bread", quantity: 4 }] },
    });
  });

  it("refuses an empty gift and half-filled goods", () => {
    expect(
      errorsOf(giftCommand({ factionId: 1, coins: "", materialId: "", quantity: "" })),
    ).toEqual({
      coins: "Send coins or goods",
    });
    expect(
      errorsOf(giftCommand({ factionId: 1, coins: "", materialId: "bread", quantity: "" })),
    ).toEqual({
      quantity: "Enter how many",
    });
    expect(
      errorsOf(giftCommand({ factionId: 1, coins: "", materialId: "", quantity: "3" })),
    ).toEqual({
      materialId: "Name the goods to send",
    });
  });
});

describe("envoyCommand", () => {
  it("maps the acts to the diplomatic act types", () => {
    expect(commandOf(envoyCommand(13, EnvoyAct.TradeAgreement))).toMatchObject({
      actType: "trade-agreement",
    });
    expect(commandOf(envoyCommand(13, EnvoyAct.Overture))).toMatchObject({ actType: "overture" });
    expect(commandOf(envoyCommand(13, EnvoyAct.War))).toEqual({
      kind: "IssueDiplomaticAct",
      actType: "declaration",
      targetFactionId: 13,
      declaration: "war",
    });
  });
});

describe("tradeCommand", () => {
  it("builds TradeSell and TradeBuy", () => {
    const form = { side: TradeSide.Sell, traderId: "11", materialId: "wheat", quantity: "10" };
    expect(commandOf(tradeCommand(form))).toEqual({
      kind: "TradeSell",
      traderId: 11,
      materialId: "wheat",
      quantity: 10,
    });
    expect(commandOf(tradeCommand({ ...form, side: TradeSide.Buy })).kind).toBe("TradeBuy");
    expect(errorsOf(tradeCommand({ ...form, materialId: "", quantity: "0" }))).toEqual({
      quantity: "Must be at least 1",
      materialId: "Choose goods",
    });
  });
});

describe("isCommand and fieldErrorsOf", () => {
  it("tell a command from errors and a refusal from a success", () => {
    expect(
      isCommand(
        tradeCommand({ side: TradeSide.Buy, traderId: "1", materialId: "wheat", quantity: "1" }),
      ),
    ).toBe(true);
    expect(
      isCommand(tradeCommand({ side: TradeSide.Buy, traderId: "", materialId: "", quantity: "" })),
    ).toBe(false);
    const refusal = {
      ok: false,
      error: { kind: "invalid-payload", message: "bad", issues: ["quantity: Too small"] },
    };
    expect(fieldErrorsOf(refusal as never)).toEqual({ quantity: "Too small" });
    expect(fieldErrorsOf({ ok: true } as never)).toEqual({});
  });
});
