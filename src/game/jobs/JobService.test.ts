import { describe, expect, it } from "vitest";
import { SettlementTier } from "../content/contentTypes";
import { JobService, tierOrder } from "./JobService";

describe("JobService", () => {
  it("keeps back-offs sorted, replaces one per entity and posting, and expires them", () => {
    const service = new JobService();
    service.addBackoff(7, 3, 100);
    service.addBackoff(4, 9, 50);
    service.addBackoff(4, 2, 60);
    service.addBackoff(4, 2, 80);
    expect(service.backoffs()).toEqual([
      { entityId: 4, postingId: 2, untilTick: 80 },
      { entityId: 4, postingId: 9, untilTick: 50 },
      { entityId: 7, postingId: 3, untilTick: 100 },
    ]);
    expect(service.isBackedOff(4, 2, 79)).toBe(true);
    expect(service.isBackedOff(4, 2, 80)).toBe(false);
    expect(service.isBackedOff(5, 2, 0)).toBe(false);
  });

  it("prunes expired back-offs and those of vanished postings, and forgets deleted entities", () => {
    const service = new JobService();
    service.addBackoff(4, 1, 10);
    service.addBackoff(4, 2, 100);
    service.addBackoff(5, 3, 100);
    service.addBackoff(6, 2, 100);
    service.prune(20, (postingId) => postingId !== 3);
    expect(service.backoffs().map((entry) => [entry.entityId, entry.postingId])).toEqual([
      [4, 2],
      [6, 2],
    ]);
    service.forgetEntity(4);
    expect(service.backoffs().map((entry) => entry.entityId)).toEqual([6]);
  });

  it("stores the wage payer and the tier source hooks", () => {
    const service = new JobService();
    expect(service.wagePayer()).toBeNull();
    const payer = (): void => undefined;
    service.setWagePayer(payer);
    expect(service.wagePayer()).toBe(payer);
    service.setWagePayer(null);
    expect(service.wagePayer()).toBeNull();
    expect(service.currentTier()).toBe(SettlementTier.Hamlet);
    service.setTierSource(() => SettlementTier.Village);
    expect(service.currentTier()).toBe(SettlementTier.Village);
    service.setTierSource(null);
    expect(service.currentTier()).toBe(SettlementTier.Hamlet);
    expect(tierOrder[0]).toBe(SettlementTier.Hamlet);
  });

  it("serializes the back-offs in its save section and restores them from JSON", () => {
    const service = new JobService();
    service.addBackoff(4, 2, 80);
    const section = service.createSection();
    expect(section.key).toBe("jobboard");
    const saved = JSON.parse(JSON.stringify(section.serialize()));
    expect(saved).toEqual({ backoffs: [{ entityId: 4, postingId: 2, untilTick: 80 }] });
    const other = new JobService();
    other.createSection().restore(saved);
    expect(other.backoffs()).toEqual(service.backoffs());
    expect(section.schema.safeParse({ backoffs: [{ entityId: 0 }] }).success).toBe(false);
    expect(section.defaultForOlderSaves?.()).toEqual({ backoffs: [] });
  });
});
