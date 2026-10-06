import { describe, expect, it } from "vitest";
import { GameEngine } from "../engine/GameEngine";
import { loadContent } from "../content/ContentLoader";
import { HousingService } from "./HousingService";
import { bindHousingService, getHousingService } from "./housingServiceRegistry";

describe("housingServiceRegistry", () => {
  it("finds the service the engine registered for itself", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(getHousingService(engine)).toBeInstanceOf(HousingService);
  });

  it("binds another service to an engine", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const replacement = new HousingService();
    bindHousingService(engine, replacement);
    expect(getHousingService(engine)).toBe(replacement);
  });
});
