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
      "agreements",
      "animals",
      "build-menu",
      "cell",
      "chronicle",
      "construction-queue",
      "content-entry",
      "content-registries",
      "crops",
      "directives",
      "dwelling",
      "dwellings",
      "dwellings-at-or-above",
      "entities",
      "entity",
      "envoys",
      "event-log",
      "explain",
      "faction-of",
      "factions",
      "factions-diplomacy",
      "find-path",
      "find-route",
      "flow",
      "flow-of",
      "housing",
      "identity-of",
      "idle-blocked",
      "job",
      "job-boards",
      "jobs-on",
      "journal",
      "map",
      "map-entities",
      "map-geometry",
      "maps",
      "members-of",
      "milestones",
      "moments-since",
      "needs-of",
      "order",
      "pending-commands",
      "pending-routes",
      "pending-updates",
      "production-orders",
      "proposals",
      "reachable",
      "recipes-for",
      "reservations",
      "settlement",
      "settlement-progress",
      "site",
      "skills-of",
      "standing-order",
      "standing-orders",
      "state",
      "steward",
      "stock",
      "stockpiles",
      "time",
      "town-criers",
      "trade-ledger",
      "trade-offers",
      "trade-orders",
      "trade-quote",
      "traders",
      "traits-of",
      "treasury",
      "unlocks",
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
    expect(session.query.mapGeometry(9)).toBeNull();
    expect(session.query.mapEntities(9)).toBeNull();
    expect(session.query.mapGeometry(1)?.polygons.length).toBe(session.query.map(1)?.cellCount);
    expect(session.query.run("map-entities", { mapId: 1 }).ok).toBe(true);
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
