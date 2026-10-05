import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession";
import { MapSize } from "../../map/mapSize";
import { createScenarioSession } from "./createScenarioSession";

describe("createScenarioSession", () => {
  it("knows the debug command that a plain session lacks", () => {
    expect(createScenarioSession().engine.getCommandHandler("DebugSpawn")).toBeDefined();
    expect(new GameSession().engine.getCommandHandler("DebugSpawn")).toBeUndefined();
  });

  it("spawns prototypes with starting items, applied on the next tick", () => {
    const session = createScenarioSession();
    session.newGame({ seed: 42, mapSize: MapSize.Small });
    const before = session.query.entities().total;
    const result = session.dispatch({
      kind: "DebugSpawn",
      prototypeId: "chest",
      mapId: 1,
      cells: [300, 301],
      inventory: [{ materialId: "wheat", quantity: 5 }],
    });
    expect(result.ok).toBe(true);
    expect(session.query.entities().total).toBe(before);
    session.step(1);
    expect(session.query.entities().total).toBe(before + 2);
    const stock = session.query.run("stock", { materialId: "wheat" });
    expect(stock).toMatchObject({ ok: true, data: { total: 10 } });
  });

  it("rejects a cell that is not on the map and replays like any command", () => {
    const session = createScenarioSession();
    session.newGame({ seed: 42, mapSize: MapSize.Small });
    session.dispatch({ kind: "DebugSpawn", prototypeId: "chest", mapId: 1, cells: [300] });
    session.dispatch({ kind: "DebugSpawn", prototypeId: "chest", mapId: 1, cells: [99_999_999] });
    session.step(3);
    expect(session.query.entities().total).toBeGreaterThan(0);
    const fresh = createScenarioSession();
    expect(fresh.replay(session.commandLog, { expectedHash: session.stateHash() }).ok).toBe(true);
  });
});
