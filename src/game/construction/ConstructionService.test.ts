import { describe, expect, it } from "vitest";
import { ConstructionService } from "./ConstructionService";
import { recentRetentionTicks, SiteKind, SiteStatus } from "./constructionTypes";
import type { RecentJob } from "./constructionTypes";

function job(jobId: number, finishedTick: number): RecentJob {
  return {
    jobId,
    kind: SiteKind.Construct,
    prototypeId: "oven",
    status: SiteStatus.Done,
    mapId: 1,
    cellIndex: 7,
    finishedTick,
  };
}

// @covers 016:FR-015 016:SC-004
describe("ConstructionService", () => {
  it("remembers finished jobs oldest first and forgets them after a day", () => {
    const service = new ConstructionService();
    service.remember(job(5, 10));
    service.remember(job(6, 100));
    expect(service.recent().map((entry) => entry.jobId)).toEqual([5, 6]);
    expect(service.prune(10 + recentRetentionTicks - 1)).toBe(0);
    expect(service.prune(10 + recentRetentionTicks)).toBe(1);
    expect(service.recent().map((entry) => entry.jobId)).toEqual([6]);
  });

  it("round-trips through its save section", () => {
    const service = new ConstructionService();
    service.remember(job(5, 10));
    const section = service.createSection();
    const saved = JSON.parse(JSON.stringify(section.serialize()));
    const other = new ConstructionService();
    other.createSection().restore(saved);
    expect(other.recent()).toEqual(service.recent());
    expect(section.key).toBe("construction");
    expect(section.defaultForOlderSaves?.()).toEqual({ recent: [] });
  });
});
