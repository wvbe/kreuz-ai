import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { TreasuryService } from "./TreasuryService";
import { bindTreasuryService, getTreasuryService } from "./treasuryServiceRegistry";

describe("treasuryServiceRegistry", () => {
  it("finds the service the engine registered for itself", () => {
    const engine = new GameEngine(loadContent());
    expect(getTreasuryService(engine)).toBeInstanceOf(TreasuryService);
  });

  it("binds a replacement service per engine", () => {
    const engine = new GameEngine(loadContent());
    const replacement = new TreasuryService();
    bindTreasuryService(engine, replacement);
    expect(getTreasuryService(engine)).toBe(replacement);
    expect(getTreasuryService(new GameEngine(loadContent()))).not.toBe(replacement);
  });
});
