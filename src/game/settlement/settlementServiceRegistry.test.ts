import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { SettlementService } from "./SettlementService";
import { bindSettlementService, getSettlementService } from "./settlementServiceRegistry";

describe("settlementServiceRegistry", () => {
  it("gives every engine its own service, registered by the engine itself", () => {
    const first = new GameEngine(loadContent(), { entropy: () => 1 });
    const second = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(getSettlementService(first)).toBeInstanceOf(SettlementService);
    expect(getSettlementService(first)).not.toBe(getSettlementService(second));
  });

  it("binds a replacement service", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const service = new SettlementService();
    bindSettlementService(engine, service);
    expect(getSettlementService(engine)).toBe(service);
  });
});
