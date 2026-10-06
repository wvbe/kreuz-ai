/* eslint-disable no-restricted-syntax -- tests read typed views out of query JSON */
import { describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { PaintAction, ToolStore } from "../selection/ToolStore";
import { commitStroke } from "./commitStroke";

function startedHost(): EngineHost {
  const host = new EngineHost();
  host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
  return host;
}

function zonesOf(host: EngineHost) {
  const result = host.store.query("zones", { mapId: 1 });
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

describe("commitStroke", () => {
  it("designates a zone from the cells of a paint stroke", () => {
    const host = startedHost();
    const tools = new ToolStore();
    tools.enterPaint(PaintAction.Designate, { zoneTypeId: "stockpile" });
    const result = commitStroke(host.commands, tools.getSnapshot(), 1, [257, 258]);
    expect(result?.ok).toBe(true);
    host.step(1);
    expect(zonesOf(host)).toEqual([
      expect.objectContaining({
        zoneTypeId: "stockpile",
        tiles: expect.arrayContaining([257, 258]),
      }),
    ]);
  });

  it("adds tiles to and removes tiles from a zone", () => {
    const host = startedHost();
    host.commands.send({ kind: "DesignateZone", zoneTypeId: "stockpile", mapId: 1, cells: [257] });
    host.step(1);
    const zoneId = (zonesOf(host)[0] as { id: number }).id;
    const tools = new ToolStore();
    tools.enterPaint(PaintAction.AddTiles, { zoneId });
    commitStroke(host.commands, tools.getSnapshot(), 1, [258]);
    host.step(1);
    expect((zonesOf(host)[0] as { tiles: number[] }).tiles).toHaveLength(2);
    tools.enterPaint(PaintAction.RemoveTiles, { zoneId });
    commitStroke(host.commands, tools.getSnapshot(), 1, [258]);
    host.step(1);
    expect((zonesOf(host)[0] as { tiles: number[] }).tiles).toEqual([257]);
  });

  it("queues walls on the cells the check accepts and sends nothing when none is", () => {
    const host = startedHost();
    const tools = new ToolStore();
    tools.enterWalls();
    expect(
      commitStroke(host.commands, tools.getSnapshot(), 1, [300, 301], (cell) => cell === 300)?.ok,
    ).toBe(true);
    expect(commitStroke(host.commands, tools.getSnapshot(), 1, [300], () => false)).toBeNull();
    host.step(1);
    const queue = host.store.query("construction-queue", {});
    const jobs = queue.ok ? (queue.data as unknown as { jobs: { cellIndex: number }[] }).jobs : [];
    expect(jobs.map((job) => job.cellIndex)).toEqual([300]);
  });

  it("sends nothing for an empty stroke or a tool that does not stroke", () => {
    const host = startedHost();
    const tools = new ToolStore();
    expect(commitStroke(host.commands, tools.getSnapshot(), 1, [1])).toBeNull();
    tools.enterPaint(PaintAction.Designate, { zoneTypeId: "stockpile" });
    expect(commitStroke(host.commands, tools.getSnapshot(), 1, [])).toBeNull();
    tools.enterPaint(PaintAction.AddTiles, {});
    expect(commitStroke(host.commands, tools.getSnapshot(), 1, [1])).toBeNull();
  });
});
/* eslint-enable no-restricted-syntax -- end of the test file */
