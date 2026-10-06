import { describe, expect, it } from "vitest";
import { DwellingLevel } from "../content/contentTypes";
import { LevelChange } from "./advanceStreaks";
import { HousingService } from "./HousingService";
import { ImmigrationBlockedReason } from "./housingTypes";

const evaluation = {
  current: { level: DwellingLevel.Hovel, met: true, requirements: [] },
  next: null,
  change: LevelChange.Up,
};

describe("HousingService", () => {
  it("remembers, recalls and forgets the findings of an evaluation", () => {
    const service = new HousingService();
    expect(service.recall(5)).toBeNull();
    service.remember(5, 72, evaluation);
    expect(service.recall(5)).toEqual({ tick: 72, value: evaluation });
    service.forget(5);
    expect(service.recall(5)).toBeNull();
  });

  it("keeps the level of a retired dwelling until it is handled", () => {
    const service = new HousingService();
    service.retire(7, DwellingLevel.Cottage);
    expect(service.retiredLevel(7)).toBe("cottage");
    service.unretire(7);
    expect(service.retiredLevel(7)).toBeNull();
  });

  it("tracks why settlers cannot come and resets with everything else", () => {
    const service = new HousingService();
    expect(service.immigrationBlocked()).toBeNull();
    service.setBlocked(ImmigrationBlockedReason.NoArrivalCell);
    service.remember(1, 1, evaluation);
    expect(service.immigrationBlocked()).toBe("NoArrivalCell");
    service.reset();
    expect(service.immigrationBlocked()).toBeNull();
    expect(service.recall(1)).toBeNull();
  });
});
