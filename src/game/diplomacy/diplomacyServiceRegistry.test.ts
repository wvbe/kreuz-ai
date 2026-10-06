import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { DiplomacyService } from "./DiplomacyService";
import { bindDiplomacyService, getDiplomacyService } from "./diplomacyServiceRegistry";

describe("diplomacyServiceRegistry", () => {
  it("finds the service the engine registered for itself", () => {
    const engine = new GameEngine(loadContent());
    expect(getDiplomacyService(engine)).toBeInstanceOf(DiplomacyService);
  });

  it("binds a replacement service and keeps engines apart", () => {
    const first = new GameEngine(loadContent());
    const second = new GameEngine(loadContent());
    expect(getDiplomacyService(first)).not.toBe(getDiplomacyService(second));
    const replacement = new DiplomacyService();
    bindDiplomacyService(first, replacement);
    expect(getDiplomacyService(first)).toBe(replacement);
  });
});
