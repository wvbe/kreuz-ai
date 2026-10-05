import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiErrorKind } from "../../src/game/api/ApiError";
import { CommandKind } from "../../src/game/api/Command";
import type { Command } from "../../src/game/api/Command";
import type { CommandLogEntry } from "../../src/game/api/CommandLog";
import { RunStopReason } from "../../src/game/api/CommandResult";
import type { CommandResult } from "../../src/game/api/CommandResult";
import { defineCommand } from "../../src/game/api/defineCommand";
import { defineQuery } from "../../src/game/api/defineQuery";
import { GameSession } from "../../src/game/api/GameSession";
import { loadContent } from "../../src/game/content/ContentLoader";
import { CommandMode } from "../../src/game/engine/engineSystemTypes";
import { TickSlot } from "../../src/game/engine/TickPipeline";
import { MapSize } from "../../src/game/map/mapSize";
import { SaveSectionLocation } from "../../src/game/save/SaveSectionRegistry";
import { SpeedSetting } from "../../src/game/time/GameTime";

// The facade end to end: a test-local fake "phase" registers a command, a query, a tick function
// and a save section in one registerSystem call, without touching any file of src/game/api.

const ledgerSchema = z.object({ total: z.number().int(), history: z.array(z.number().int()) });

function createSession(): GameSession {
  const session = new GameSession(loadContent(), { entropy: () => 4242 });
  const ledger = { total: 0, history: [] as number[] };
  session.registerSystem({
    id: "fake.ledger",
    slot: TickSlot.World,
    run: (context) => {
      if (context.tick % 4 === 0) {
        ledger.history.push(ledger.total);
      }
    },
    saveSection: {
      key: "fakeLedger",
      location: SaveSectionLocation.Systems,
      schema: ledgerSchema,
      serialize: () => ({ total: ledger.total, history: [...ledger.history] }),
      restore: (saved) => {
        const parsed = ledgerSchema.parse(saved);
        ledger.total = parsed.total;
        ledger.history = [...parsed.history];
      },
    },
    commandHandlers: {
      "fake.add": defineCommand({
        schema: z.object({ amount: z.number().int() }).strict(),
        handler: (payload) => {
          if (payload.amount < 0) {
            throw new Error("negative amounts are refused");
          }
          ledger.total += payload.amount;
          return null;
        },
      }),
      "fake.peek": defineCommand({
        schema: z.object({}).strict(),
        mode: CommandMode.Immediate,
        handler: () => ledger.total,
      }),
    },
    queries: {
      "fake.total": defineQuery({
        schema: z.object({}).strict(),
        run: () => ({ total: ledger.total, history: ledger.history }),
      }),
    },
  });
  return session;
}

const script: readonly Command[] = [
  { kind: CommandKind.NewGame, options: { seed: 99, mapSize: MapSize.Small } },
  { kind: CommandKind.Step, ticks: 3 },
  { kind: CommandKind.SetSpeed, speed: SpeedSetting.Double },
  { kind: CommandKind.Step, ticks: 5 },
  { kind: CommandKind.Pause },
  { kind: CommandKind.SaveGame },
  { kind: CommandKind.Resume },
  { kind: CommandKind.SetTickInterval, tickIntervalMs: 500 },
  { kind: CommandKind.Step, ticks: 12 },
];

function runScript(session: GameSession): void {
  for (const command of script) {
    const result = session.dispatch(command);
    expect(result.ok).toBe(true);
    if (command.kind === CommandKind.Step && command.ticks === 3) {
      // Queued commands accepted between ticks; applied FIFO at slot 1 of the next tick.
      expect(session.dispatch({ kind: "fake.add", amount: 5 }).ok).toBe(true);
      expect(session.dispatch({ kind: "fake.add", amount: -1 }).ok).toBe(true);
      expect(session.dispatch({ kind: "fake.add", amount: 7 }).ok).toBe(true);
    }
  }
}

describe("GameSession end to end", () => {
  it("replays the exported command log into a fresh session with an identical state hash", () => {
    const live = createSession();
    runScript(live);
    const hash = live.stateHash();
    const log = JSON.parse(JSON.stringify(live.commandLog)) as CommandLogEntry[];
    expect(log.length).toBe(script.length + 3);

    const fresh = createSession();
    const replayed = fresh.replay(log, { expectedHash: hash });
    expect(replayed).toMatchObject({ ok: true, stateHash: hash, applied: log.length });
    expect(fresh.stateHash()).toBe(hash);
    expect(fresh.commandLog).toEqual(live.commandLog);
    expect(fresh.query.run("fake.total")).toEqual(live.query.run("fake.total"));
    expect(live.query.run("fake.total")).toEqual({
      ok: true,
      data: { total: 12, history: [12, 12, 12, 12, 12] },
    });
  });

  it("detects a diverging replay through the expected hash and the dispatch ticks", () => {
    const live = createSession();
    runScript(live);
    const log = live.commandLog;
    const wrong = createSession().replay(log, { expectedHash: "0000000000000000" });
    expect(wrong).toMatchObject({ ok: false, error: { kind: ApiErrorKind.ReplayFailed } });
    const shifted = log.map((entry, index) =>
      index === 2 ? { ...entry, tick: entry.tick + 1 } : entry,
    );
    expect(createSession().replay(shifted)).toMatchObject({
      ok: false,
      index: 2,
      error: { kind: ApiErrorKind.ReplayFailed },
    });
    expect(createSession().replay([{ nonsense: true }] as never)).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.ReplayFailed },
    });
  });

  it("applies queued commands at the next tick, rejections included, and logs the apply tick", () => {
    const session = createSession();
    session.newGame({ seed: 1 });
    const queued = session.dispatch({ kind: "fake.add", amount: 4 });
    expect(queued).toMatchObject({ ok: true, queued: true, data: null });
    const rejected = session.dispatch({ kind: "fake.add", amount: -9 });
    expect(session.query.pendingCommands().commands.map((entry) => entry.kind)).toEqual([
      "fake.add",
      "fake.add",
    ]);
    expect(session.query.run("fake.total")).toMatchObject({ data: { total: 0 } });
    const result = session.step(1);
    expect(result.ok && result.data).toEqual({ ticksRun: 1, tick: 1, paused: false });
    if (!result.ok || !queued.ok || !rejected.ok) throw new Error("dispatch failed");
    const names = result.events.map((event) => event.name);
    expect(names).toEqual(expect.arrayContaining(["command.applied", "command.rejected"]));
    const rejection = result.events.find((event) => event.name === "command.rejected");
    expect(rejection?.payload).toEqual({
      commandId: rejected.commandId,
      commandKind: "fake.add",
      code: ApiErrorKind.CommandFailed,
    });
    expect(session.query.run("fake.total")).toMatchObject({ data: { total: 4 } });
    expect(session.query.pendingCommands().commands).toEqual([]);
    const entry = session.commandLog.find((candidate) => candidate.commandId === queued.commandId);
    expect(entry).toMatchObject({ tick: 0, appliedTick: 1 });
  });

  it("queues commands while paused and applies them deterministically at the next step", () => {
    const run = (): { hash: string; total: unknown } => {
      const session = createSession();
      session.newGame({ seed: 5 });
      session.dispatch({ kind: CommandKind.Pause });
      session.dispatch({ kind: "fake.add", amount: 2 });
      session.dispatch({ kind: "fake.add", amount: 3 });
      expect(session.query.run("fake.total")).toMatchObject({ data: { total: 0 } });
      const paused = session.step(10);
      expect(paused.ok && paused.data).toEqual({ ticksRun: 0, tick: 0, paused: true });
      expect(session.query.run("fake.total")).toMatchObject({ data: { total: 5 } });
      session.dispatch({ kind: CommandKind.Resume });
      session.step(2);
      return { hash: session.stateHash(), total: session.query.run("fake.total") };
    };
    expect(run()).toEqual(run());
  });

  it("keeps commands queued across save and load", () => {
    const session = createSession();
    session.newGame({ seed: 8 });
    session.step(2);
    session.dispatch({ kind: "fake.add", amount: 9 });
    const saved = session.save();
    if (!saved.ok || typeof saved.data !== "string") throw new Error("save failed");
    const other = createSession();
    expect(other.load(saved.data).ok).toBe(true);
    expect(other.query.pendingCommands().commands).toHaveLength(1);
    other.step(1);
    expect(other.query.run("fake.total")).toMatchObject({ data: { total: 9 } });
    session.step(1);
    expect(other.stateHash()).toBe(session.stateHash());
  });

  it("returns structured errors for bad input and changes nothing", () => {
    const session = createSession();
    session.newGame({ seed: 3 });
    session.step(2);
    const before = session.stateHash();
    const logLength = session.commandLog.length;
    const bad: { input: unknown; kind: ApiErrorKind }[] = [
      { input: null, kind: ApiErrorKind.InvalidCommand },
      { input: "step", kind: ApiErrorKind.InvalidCommand },
      { input: { ticks: 3 }, kind: ApiErrorKind.InvalidCommand },
      { input: { kind: 7 }, kind: ApiErrorKind.InvalidCommand },
      { input: { kind: "bogus" }, kind: ApiErrorKind.UnknownCommand },
      { input: { kind: CommandKind.Step, ticks: 0 }, kind: ApiErrorKind.InvalidPayload },
      {
        input: { kind: CommandKind.Step, ticks: 1, extra: true },
        kind: ApiErrorKind.InvalidPayload,
      },
      { input: { kind: CommandKind.SetSpeed, speed: 3 }, kind: ApiErrorKind.InvalidPayload },
      { input: { kind: "fake.add", amount: "3" }, kind: ApiErrorKind.InvalidPayload },
      {
        input: { kind: CommandKind.LoadGame, save: "not json" },
        kind: ApiErrorKind.InvalidSaveFormat,
      },
      {
        input: { kind: CommandKind.NewGame, options: { difficulty: "nightmare" } },
        kind: ApiErrorKind.InvalidOptions,
      },
    ];
    for (const { input, kind } of bad) {
      const result = session.dispatch(input);
      expect(result).toMatchObject({ ok: false, error: { kind } });
    }
    const cyclic: { kind: string; self?: object } = { kind: "fake.add" };
    cyclic.self = cyclic;
    expect(session.dispatch(cyclic).ok).toBe(false);
    expect(session.stateHash()).toBe(before);
    expect(session.commandLog).toHaveLength(logLength);
    expect(session.query.time().tick).toBe(2);
    const options = session.dispatch({
      kind: CommandKind.NewGame,
      options: { difficulty: "nightmare" },
    });
    expect(options.ok === false && options.error.issues).toEqual([
      "Invalid difficulty: 'nightmare'. Valid values: peaceful, steady, harsh.",
    ]);
    expect(session.dispatch({ kind: CommandKind.NewGame, options: { seed: 1.5 } })).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.InvalidPayload },
    });
  });

  it("answers commands that need a game with a structured error before the first game", () => {
    const session = createSession();
    for (const command of [
      { kind: CommandKind.Step, ticks: 1 },
      { kind: CommandKind.Pause },
      { kind: CommandKind.SaveGame },
      { kind: "fake.add", amount: 1 },
    ]) {
      expect(session.dispatch(command)).toMatchObject({
        ok: false,
        error: { kind: ApiErrorKind.NoGame },
      });
    }
    expect(session.runUntil(() => true, 5)).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.NoGame },
    });
    expect(session.commandLog).toEqual([]);
  });

  it("runs until a predicate over the view holds, bounded, and logs one Step", () => {
    const session = createSession();
    session.newGame({ seed: 4 });
    const reached = session.runUntil((view) => view.time().tick >= 7, 100);
    expect(reached).toMatchObject({
      ok: true,
      satisfied: true,
      stopReason: RunStopReason.Satisfied,
      ticksRun: 7,
      tick: 7,
    });
    const bounded = session.runUntil(() => false, 3);
    expect(bounded).toMatchObject({
      satisfied: false,
      stopReason: RunStopReason.MaxTicks,
      ticksRun: 3,
    });
    expect(session.runUntil(() => true, 3)).toMatchObject({ satisfied: true, ticksRun: 0 });
    expect(session.runUntil(() => false, -1)).toMatchObject({ ok: false });
    expect(
      session.runUntil(() => {
        throw new Error("predicate broke");
      }, 3),
    ).toMatchObject({ ok: false, error: { kind: ApiErrorKind.PredicateFailed } });
    session.dispatch({ kind: CommandKind.Pause });
    expect(session.runUntil(() => false, 3)).toMatchObject({
      stopReason: RunStopReason.Paused,
      ticksRun: 0,
    });
    const steps = session.commandLog.filter((entry) => entry.command.kind === CommandKind.Step);
    expect(steps.map((entry) => entry.command["ticks"])).toEqual([7, 3]);
    const fresh = createSession();
    expect(fresh.replay(session.commandLog, { expectedHash: session.stateHash() }).ok).toBe(true);
  });

  it("exposes views that are plain JSON and cannot write through", () => {
    const session = createSession();
    session.newGame({ seed: 12, mapSize: MapSize.Small });
    session.step(3);
    const names = session.query.names();
    expect(names).toEqual(
      expect.arrayContaining([
        "cell",
        "entities",
        "entity",
        "event-log",
        "fake.total",
        "map",
        "maps",
        "pending-commands",
        "settlement",
        "skills-of",
        "state",
        "time",
        "traits-of",
      ]),
    );
    const views: unknown[] = [
      session.query.state(),
      session.query.time(),
      session.query.entities(),
      session.query.entity(1),
      session.query.maps(),
      session.query.map(1),
      session.query.cell(1, 0),
      session.query.settlement(),
      session.query.eventLog(),
      session.query.pendingCommands(),
    ];
    for (const view of views) {
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    }
    for (const name of names) {
      const result = session.query.run(
        name,
        name === "entity"
          ? { id: 1 }
          : name === "map"
            ? { mapId: 1 }
            : name === "cell"
              ? { mapId: 1, cell: 0 }
              : name === "skills-of" ||
                  name === "traits-of" ||
                  name === "identity-of" ||
                  name === "faction-of" ||
                  name === "needs-of"
                ? { entityId: 3 }
                : name === "jobs-on"
                  ? { boardId: 2 }
                  : name === "job"
                    ? { postingId: 1 }
                    : name === "find-path"
                      ? { mapId: 1, from: 0, target: 1 }
                      : name === "find-route"
                        ? { from: { mapId: 1, cellIndex: 0 }, target: { mapId: 1, cellIndex: 1 } }
                        : name === "reachable"
                          ? { mapId: 1, from: 0 }
                          : name === "members-of"
                            ? { factionId: 1 }
                            : name === "order"
                              ? { orderId: 1 }
                              : name === "recipes-for"
                                ? { workstationId: 1 }
                                : name === "site"
                                  ? { jobId: 1 }
                                  : name === "validate-placement"
                                    ? { prototypeId: "chest", mapId: 1, cellIndex: 0 }
                                    : name === "zone"
                                      ? { zoneId: 1 }
                                      : name === "zone-at"
                                        ? { mapId: 1, cellIndex: 0 }
                                        : name === "explain"
                                          ? { id: 3 }
                                          : name === "flow-of"
                                            ? { materialId: "bread" }
                                            : {},
      );
      expect(result.ok).toBe(true);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }

    const hash = session.stateHash();
    const detail = session.query.entity(1);
    const map = session.query.map(1);
    const list = session.query.entities();
    const log = session.query.eventLog();
    expect(detail?.prototype).toBe("government_faction");
    const mutable = detail as unknown as { prototype: string; components: Record<string, unknown> };
    mutable.prototype = "hacked";
    mutable.components["Injected"] = { x: 1 };
    (map?.terrain as string[] | undefined)?.fill("lava");
    (list.entities as unknown as { id: number }[]).length = 0;
    (log.events as unknown[]).length = 0;
    const run = session.query.run("map", { mapId: 1 });
    if (run.ok && typeof run.data === "object" && run.data !== null && !Array.isArray(run.data)) {
      (run.data["terrain"] as string[]).fill("lava");
    }
    expect(session.stateHash()).toBe(hash);
    expect(session.query.entity(1)?.prototype).toBe("government_faction");
    expect(session.query.map(1)?.terrain).not.toContain("lava");
    expect(session.query.entities().entities).toHaveLength(list.total);
    expect(session.query.eventLog().events.length).toBeGreaterThan(0);
  });

  it("answers query problems with structured errors", () => {
    const session = createSession();
    session.newGame({ seed: 12, mapSize: MapSize.Small });
    expect(session.query.run("nope")).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.UnknownQuery },
    });
    expect(session.query.run("entity", { id: "x" })).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.InvalidPayload },
    });
    expect(session.query.run("map", { mapId: 99 })).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.NotFound },
    });
    expect(session.query.run("cell", { mapId: 1, cell: 999999 })).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.NotFound },
    });
    expect(session.query.entity(999)).toBeNull();
    expect(session.query.map(99)).toBeNull();
    expect(session.query.cell(1, 999999)).toBeNull();
  });

  it("delivers events to subscribers and attaches the call's events to results", () => {
    const session = createSession();
    const seen: string[] = [];
    const unsubscribe = session.events.subscribe("game.*", (event) => {
      seen.push(`${event.seq}:${event.name}`);
    });
    const started = session.newGame({ seed: 6 });
    if (!started.ok) throw new Error("new game failed");
    expect(started.events.map((event) => event.name)).toContain("game.started");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^\d+:game\.started$/);
    session.dispatch({ kind: CommandKind.Pause });
    session.dispatch({ kind: CommandKind.Resume });
    expect(seen.map((entry) => entry.split(":")[1])).toEqual([
      "game.started",
      "game.paused",
      "game.resumed",
    ]);
    unsubscribe();
    session.dispatch({ kind: CommandKind.Pause });
    expect(seen).toHaveLength(3);
    expect(session.events.recent(2).map((event) => event.name)).toEqual([
      "game.resumed",
      "game.paused",
    ]);
  });

  it("bounds the recent-event buffer and reports dropped events", () => {
    const session = new GameSession(loadContent(), { entropy: () => 1, recentEventLimit: 3 });
    session.newGame({ seed: 2 });
    let result: CommandResult = session.step(10);
    if (!result.ok) throw new Error("step failed");
    expect(result.events.length).toBeLessThanOrEqual(3);
    expect(result.events.length + result.droppedEvents).toBeGreaterThanOrEqual(10);
    result = session.dispatch({ kind: CommandKind.Pause });
    expect(result.ok && result.events.map((event) => event.name)).toEqual(["game.paused"]);
  });

  it("keeps two sessions isolated", () => {
    const first = createSession();
    const second = createSession();
    first.newGame({ seed: 1 });
    second.newGame({ seed: 2 });
    first.dispatch({ kind: "fake.add", amount: 3 });
    first.step(5);
    expect(second.query.time().tick).toBe(0);
    expect(second.query.run("fake.total")).toMatchObject({ data: { total: 0 } });
    expect(second.commandLog).toHaveLength(1);
    expect(second.query.pendingCommands().commands).toEqual([]);
    expect(first.query.state().seed).toBe(1);
    expect(second.query.state().seed).toBe(2);
    const secondSeen: string[] = [];
    second.events.subscribe("**", (event) => secondSeen.push(event.name));
    first.step(2);
    expect(secondSeen).toEqual([]);
  });

  it("uses the seed that was drawn from entropy, so a replay needs none", () => {
    const live = new GameSession(loadContent(), { entropy: () => 31337 });
    live.dispatch({ kind: CommandKind.NewGame });
    live.step(4);
    expect(live.commandLog[0]?.command).toMatchObject({
      kind: CommandKind.NewGame,
      options: { seed: 31337 },
    });
    const fresh = new GameSession(loadContent());
    expect(fresh.replay(live.commandLog, { expectedHash: live.stateHash() }).ok).toBe(true);
    const noEntropy = new GameSession(loadContent());
    expect(noEntropy.dispatch({ kind: CommandKind.NewGame })).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.MissingEntropy },
    });
  });

  it("registers a command and a query with one call and rejects duplicates", () => {
    const session = createSession();
    expect(() =>
      session.registerSystem({
        id: "fake.other",
        commandHandlers: {
          "fake.add": defineCommand({ schema: z.object({}).strict(), handler: () => null }),
        },
      }),
    ).toThrow();
    expect(() =>
      session.registerSystem({
        id: "fake.third",
        queries: {
          time: defineQuery({ schema: z.object({}).strict(), run: () => null }),
        },
      }),
    ).toThrow();
    session.newGame({ seed: 1 });
    const immediate = session.dispatch({ kind: "fake.peek" });
    expect(immediate).toMatchObject({ ok: true, queued: false, data: 0 });
  });
});
