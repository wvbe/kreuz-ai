import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadContent } from "../content/ContentLoader";
import { MapSize } from "../map/mapSize";
import { ApiErrorKind } from "./ApiError";
import { defineCommand } from "./defineCommand";
import { GameSession } from "./GameSession";

function startedSession(): GameSession {
  const session = new GameSession(loadContent(), { entropy: () => 7 });
  session.newGame({ seed: 10, mapSize: MapSize.Small });
  return session;
}

describe("SessionQuery", () => {
  it("lists the kernel queries", () => {
    expect(startedSession().query.names()).toEqual([
      "build-menu",
      "cell",
      "construction-queue",
      "entities",
      "entity",
      "event-log",
      "faction-of",
      "factions",
      "find-path",
      "find-route",
      "identity-of",
      "job",
      "job-boards",
      "jobs-on",
      "map",
      "maps",
      "members-of",
      "needs-of",
      "order",
      "pending-commands",
      "production-orders",
      "reachable",
      "recipes-for",
      "reservations",
      "settlement",
      "site",
      "skills-of",
      "state",
      "stock",
      "stockpiles",
      "time",
      "traits-of",
      "validate-placement",
      "workstations",
      "zone",
      "zone-at",
      "zone-merge-offers",
      "zones",
    ]);
  });

  it("serves typed views and the same data through run", () => {
    const session = startedSession();
    session.step(2);
    expect(session.query.time()).toMatchObject({ tick: 2, paused: false });
    expect(session.query.run("time")).toEqual({ ok: true, data: session.query.time() });
    expect(session.query.state()).toMatchObject({
      hasGame: true,
      seed: 10,
      startingTier: "hamlet",
    });
    expect(session.query.entities({ prototype: "government_faction" }).total).toBe(1);
    expect(session.query.entities({ limit: 1, offset: 50 }).entities).toEqual([]);
    expect(session.query.entity(1)?.prototype).toBe("government_faction");
    expect(session.query.maps().maps).toHaveLength(1);
    expect(session.query.map(1)?.cellCount).toBe(session.query.map(1)?.terrain.length);
    expect(session.query.cell(1, 0)).toMatchObject({ mapId: 1, cellIndex: 0, occupants: [] });
    expect(session.query.settlement()).toMatchObject({ tier: "hamlet", population: 6, tick: 2 });
    expect(session.query.eventLog(1).events).toHaveLength(1);
    expect(session.query.pendingCommands().commands).toEqual([]);
  });

  it("returns null for things that do not exist and errors from run", () => {
    const session = startedSession();
    expect(session.query.map(9)).toBeNull();
    expect(session.query.cell(9, 0)).toBeNull();
    expect(session.query.entity(99)).toBeNull();
    expect(session.query.run("nope")).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.UnknownQuery },
    });
    expect(session.query.run("map", { mapId: 0 })).toMatchObject({
      ok: false,
      error: { kind: ApiErrorKind.InvalidPayload, issues: [expect.stringContaining("mapId")] },
    });
    expect(session.query.run("time", { x: 1 }).ok).toBe(false);
  });

  it("shows queued commands and counts them in the state", () => {
    const session = startedSession();
    session.registerSystem({
      id: "demo.noop",
      commandHandlers: {
        "demo.noop": defineCommand({ schema: z.object({}).strict(), handler: () => null }),
      },
    });
    expect(session.dispatch({ kind: "demo.noop" }).ok).toBe(true);
    expect(session.query.state().pendingCommandCount).toBe(1);
    expect(session.query.pendingCommands().commands).toEqual([
      { commandId: 2, kind: "demo.noop", payload: {}, tick: 0 },
    ]);
    session.step(1);
    expect(session.query.state().pendingCommandCount).toBe(0);
  });
});
