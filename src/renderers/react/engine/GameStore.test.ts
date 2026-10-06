import { describe, expect, it } from "vitest";
import { GameSession } from "../../../game/api/GameSession";
import { GameStore, gameStoreEventLimit } from "./GameStore";

function started(): GameSession {
  const session = new GameSession();
  session.newGame({ seed: 42, difficulty: "steady", mapSize: 0 });
  return session;
}

describe("GameStore", () => {
  it("serves one cached result per query and version", () => {
    const session = started();
    const store = new GameStore(session);
    const first = store.query("time");
    expect(store.query("time")).toBe(first);
    expect(store.query("time", {})).toBe(first);
    session.step(2);
    expect(store.query("time")).toBe(first);
    store.invalidate();
    const second = store.query("time");
    expect(second).not.toBe(first);
    expect(second).toMatchObject({ ok: true, data: { tick: 2 } });
  });

  it("keeps failures as results and distinguishes arguments", () => {
    const store = new GameStore(started());
    expect(store.query("nope").ok).toBe(false);
    const one = store.query("cell", { mapId: 1, cell: 0 });
    const two = store.query("cell", { mapId: 1, cell: 1 });
    expect(one).not.toBe(two);
  });

  it("notifies on invalidate and bumps the version", () => {
    const store = new GameStore(started());
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    const before = store.getSnapshot();
    store.invalidate();
    expect(store.getSnapshot()).toBe(before + 1);
    expect(calls).toBe(1);
  });

  it("keeps a bounded event buffer", () => {
    const store = new GameStore(started());
    for (let seq = 0; seq < gameStoreEventLimit + 10; seq += 1) {
      store.pushEvent({ seq, tick: 0, name: "a.b", payload: null });
    }
    expect(store.recentEvents()).toHaveLength(gameStoreEventLimit);
    expect(store.recentEvents()[0]?.seq).toBe(10);
  });

  it("counts epochs", () => {
    const store = new GameStore(started());
    expect(store.epoch()).toBe(0);
    store.startEpoch();
    expect(store.epoch()).toBe(1);
  });
});
