import { describe, expect, it } from "vitest";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import { GatheringService } from "./GatheringService";
import { CropStage } from "./gatheringTypes";

const plot = {
  mapId: 1,
  cellIndex: 5,
  materialId: "wheat",
  stage: CropStage.Sown as const,
  growthMilli: 7000,
};

describe("GatheringService", () => {
  it("stores, reads and clears plots, listing them by cell", () => {
    const service = new GatheringService();
    service.setPlot({ ...plot, cellIndex: 9 });
    service.setPlot(plot);
    expect(service.plotAt(1, 5)).toEqual(plot);
    expect(service.plotAt(1, 6)).toBeUndefined();
    expect(service.plots().map((entry) => entry.cellIndex)).toEqual([5, 9]);
    expect(service.clearPlot(1, 5)).toBe(true);
    expect(service.clearPlot(1, 5)).toBe(false);
  });

  it("stores the charges of worked deposits", () => {
    const service = new GatheringService();
    expect(service.remainingAt(1, 3)).toBeUndefined();
    service.setRemaining(1, 8, 2);
    service.setRemaining(1, 3, 4);
    expect(service.remainingAt(1, 3)).toBe(4);
    expect(service.deposits()).toEqual([
      { mapId: 1, cellIndex: 3, remaining: 4 },
      { mapId: 1, cellIndex: 8, remaining: 2 },
    ]);
    service.clearRemaining(1, 3);
    expect(service.remainingAt(1, 3)).toBeUndefined();
  });

  it("saves and restores its section", () => {
    const service = new GatheringService();
    service.setPlot(plot);
    service.setRemaining(1, 3, 4);
    const section = service.createSection();
    expect(section.key).toBe("gathering");
    expect(section.location).toBe(SaveSectionLocation.Systems);
    const saved = section.serialize();
    const other = new GatheringService();
    other.setPlot({ ...plot, cellIndex: 77 });
    other.createSection().restore(saved);
    expect(other.plots()).toEqual([plot]);
    expect(other.deposits()).toEqual([{ mapId: 1, cellIndex: 3, remaining: 4 }]);
    expect(other.createSection().serialize()).toEqual(saved);
  });

  it("rejects a malformed section and defaults old saves to empty", () => {
    const section = new GatheringService().createSection();
    expect(() => section.restore({ plots: [{ mapId: 1 }], deposits: [] })).toThrow();
    expect(section.defaultForOlderSaves?.()).toEqual({ plots: [], deposits: [] });
  });
});
