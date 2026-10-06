import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { TradeService } from "./TradeService";
import { bindTradeService, getTradeService } from "./tradeServiceRegistry";

describe("tradeServiceRegistry", () => {
  it("finds the service the engine registered for itself", () => {
    const engine = new GameEngine(loadContent());
    expect(getTradeService(engine)).toBeInstanceOf(TradeService);
  });

  it("binds a replacement service and keeps engines apart", () => {
    const first = new GameEngine(loadContent());
    const second = new GameEngine(loadContent());
    expect(getTradeService(first)).not.toBe(getTradeService(second));
    const replacement = new TradeService();
    bindTradeService(first, replacement);
    expect(getTradeService(first)).toBe(replacement);
  });
});
