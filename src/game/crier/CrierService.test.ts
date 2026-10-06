import { describe, expect, it } from "vitest";
import { CrierService } from "./CrierService";
import { BoardChangeKind, UpdateOrigin } from "./crierTypes";
import type { BoardChange } from "./crierTypes";

const remove: BoardChange = { kind: BoardChangeKind.Remove, postingId: 4 };

describe("CrierService", () => {
  it("adds updates with counter ids, finds them and lists them ascending", () => {
    const service = new CrierService();
    const first = service.add(2, [remove], UpdateOrigin.Player, 5);
    const second = service.add(2, [remove], UpdateOrigin.Steward, 6);
    expect([first.updateId, second.updateId]).toEqual([1, 2]);
    expect(service.find(2)).toMatchObject({ origin: UpdateOrigin.Steward, crierId: null });
    expect(service.find(9)).toBeNull();
    expect(service.updates().map((update) => update.updateId)).toEqual([1, 2]);
  });

  it("returns copies, never the live records", () => {
    const service = new CrierService();
    service.add(2, [remove], UpdateOrigin.Player, 5);
    const copy = service.updates();
    copy[0] = { ...(copy[0] as (typeof copy)[number]), boardId: 99 };
    expect(service.find(1)?.boardId).toBe(2);
  });

  it("assigns updates to a crier and hands them back", () => {
    const service = new CrierService();
    service.add(2, [remove], UpdateOrigin.Player, 5);
    service.add(3, [remove], UpdateOrigin.Player, 5);
    service.assign([1], 8, 10, 40);
    expect(service.find(1)).toMatchObject({ crierId: 8, dispatchedTick: 10, startCost: 40 });
    expect(service.find(2)?.crierId).toBeNull();
    service.unassign([1]);
    expect(service.find(1)).toMatchObject({ crierId: null, dispatchedTick: null, startCost: 0 });
  });

  it("removes an update once and never reuses its id", () => {
    const service = new CrierService();
    service.add(2, [remove], UpdateOrigin.Player, 5);
    expect(service.remove(1)).toMatchObject({ updateId: 1 });
    expect(service.remove(1)).toBeNull();
    expect(service.add(2, [remove], UpdateOrigin.Player, 6).updateId).toBe(2);
  });

  it("round-trips through its save section and rejects broken sections", () => {
    const service = new CrierService();
    service.add(2, [remove], UpdateOrigin.Player, 5);
    service.assign([1], 8, 10, 40);
    const section = service.createSection();
    const saved = section.serialize();
    const restored = new CrierService();
    restored.createSection().restore(saved);
    expect(restored.createSection().serialize()).toEqual(saved);
    expect(restored.add(2, [remove], UpdateOrigin.Player, 6).updateId).toBe(2);
    expect(() => restored.createSection().restore({ nextUpdateId: 1, updates: saved })).toThrow();
    expect(section.defaultForOlderSaves?.()).toEqual({ nextUpdateId: 1, updates: [] });
    expect(() => section.schema.parse({ nextUpdateId: 1, updates: [{ updateId: 5 }] })).toThrow();
  });
});
