import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { JsonValue } from "../engine/EventBus";
import { MapSize } from "../map/mapSize";
import { ApiErrorKind } from "./ApiError";
import { CommandKind } from "./Command";
import { RunStopReason } from "./CommandResult";
import { GameSession } from "./GameSession";

function startedSession(): GameSession {
  const session = new GameSession(loadContent(), { entropy: () => 7 });
  session.newGame({ seed: 10, mapSize: MapSize.Small });
  return session;
}

describe("GameSession", () => {
  it("starts idle, uses the bundled pack by default and exposes its state", () => {
    const session = new GameSession();
    expect(session.hasGame).toBe(false);
    expect(session.tick).toBe(0);
    expect(session.commandLog).toEqual([]);
    expect(session.query.state().hasGame).toBe(false);
    session.newGame({ seed: 3 });
    expect(session.hasGame).toBe(true);
    expect(session.stateHash()).toMatch(/^[0-9a-f]{16}$/);
  });

  it("dispatch never throws and reports ids that grow per accepted command", () => {
    const session = startedSession();
    const first = session.dispatch({ kind: CommandKind.Pause });
    const second = session.dispatch({ kind: CommandKind.Resume });
    expect(first).toMatchObject({ ok: true, queued: false, data: null });
    expect(second.ok && first.ok && second.commandId - first.commandId).toBe(1);
    expect(session.dispatch(undefined)).toMatchObject({ ok: false });
    expect(session.dispatch({ kind: CommandKind.Pause, extra: 1 })).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.InvalidPayload, issues: [expect.stringContaining("extra")] },
    });
  });

  it("newGame, step, save and load wrap the matching commands", () => {
    const session = startedSession();
    expect(session.step(4)).toMatchObject({ ok: true, data: { ticksRun: 4, tick: 4 } });
    expect(session.step(0).ok).toBe(false);
    const saved = session.save("2026-01-01T00:00:00.000Z");
    expect(saved.ok && typeof saved.data).toBe("string");
    if (!saved.ok || typeof saved.data !== "string") throw new Error("save failed");
    expect(JSON.parse(saved.data).timestamp).toBe("2026-01-01T00:00:00.000Z");
    session.step(3);
    expect(session.load(saved.data)).toMatchObject({ ok: true, data: { migrated: false } });
    expect(session.tick).toBe(4);
    expect(session.load("{}")).toMatchObject({ ok: false });
    expect(session.tick).toBe(4);
  });

  it("registerSystem forwards to the engine", () => {
    const session = new GameSession(loadContent());
    session.registerSystem({ id: "demo.noop" });
    expect(() => session.registerSystem({ id: "demo.noop" })).toThrow();
  });

  it("runUntil stops at the bound, when paused and when the predicate is true", () => {
    const session = startedSession();
    expect(session.runUntil((view) => view.time().tick === 2, 10)).toMatchObject({
      stopReason: RunStopReason.Satisfied,
      ticksRun: 2,
    });
    expect(session.runUntil(() => false, 2)).toMatchObject({ stopReason: RunStopReason.MaxTicks });
    session.dispatch({ kind: CommandKind.Pause });
    expect(session.runUntil(() => false, 2)).toMatchObject({ stopReason: RunStopReason.Paused });
    expect(session.runUntil(() => false, 2000000).ok).toBe(false);
  });

  it("commandLog returns independent copies", () => {
    const session = startedSession();
    const log = session.commandLog;
    log.length = 0;
    log[0] = undefined as never;
    expect(session.commandLog).toHaveLength(1);
    const entry = session.commandLog[0];
    if (entry) entry.command["kind"] = "tampered";
    expect(session.commandLog[0]?.command.kind).toBe(CommandKind.NewGame);
  });

  it("replay reproduces a session and reports a missing game for a log without NewGame", () => {
    const live = startedSession();
    live.step(6);
    const fresh = new GameSession(loadContent());
    expect(fresh.replay(live.commandLog)).toMatchObject({
      ok: true,
      applied: 2,
      tick: 6,
      stateHash: live.stateHash(),
    });
    const headless = new GameSession(loadContent());
    expect(headless.replay(live.commandLog.slice(1))).toMatchObject({
      ok: false,
      index: 0,
      error: { kind: ApiErrorKind.NoGame },
    });
  });

  it("events.subscribe hands out copies and events.recent is bounded", () => {
    const session = startedSession();
    const received: JsonValue[] = [];
    session.events.subscribe("game.paused", (event) => {
      received.push(JSON.parse(JSON.stringify(event.payload)));
      (event.payload as { tick: number }).tick = 999;
    });
    session.dispatch({ kind: CommandKind.Pause });
    expect(received).toEqual([{ tick: 0 }]);
    expect(session.events.recent(1)[0]?.payload).toEqual({ tick: 0 });
  });
});
