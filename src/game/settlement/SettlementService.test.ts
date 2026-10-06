import { describe, expect, it } from "vitest";
import { DwellingLevel, SettlementTier } from "../content/contentTypes";
import { SettlementService } from "./SettlementService";

describe("SettlementService", () => {
  it("starts as a Hamlet", () => {
    expect(new SettlementService().tier()).toBe(SettlementTier.Hamlet);
  });

  it("remembers the tier set", () => {
    const service = new SettlementService();
    service.setTier(SettlementTier.Village);
    expect(service.tier()).toBe(SettlementTier.Village);
  });

  it("counts no dwellings until housing installs its counter, then asks it", () => {
    const service = new SettlementService();
    expect(service.countDwellingsAtOrAbove(DwellingLevel.Hovel)).toBe(0);
    service.setDwellingCounter((level) => (level === DwellingLevel.Hovel ? 5 : 1));
    expect(service.countDwellingsAtOrAbove(DwellingLevel.Hovel)).toBe(5);
    expect(service.countDwellingsAtOrAbove(DwellingLevel.Cottage)).toBe(1);
    service.setDwellingCounter(null);
    expect(service.countDwellingsAtOrAbove(DwellingLevel.Hovel)).toBe(0);
  });
});
