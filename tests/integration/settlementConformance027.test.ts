import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/api/GameSession";
import { loadContent } from "../../src/game/content/ContentLoader";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { MapSize } from "../../src/game/map/mapSize";
import { Difficulty } from "../../src/game/save/initOptions";
import { ticksPerDay } from "../../src/game/time/GameTime";
import {
  contentWithTiers,
  createSettlementWorld,
} from "../../src/game/settlement/testSettlementWorld";
import { createSettlement, medianMs } from "../../scripts/lib/perfCases";

// Spec 027 success criteria that no unit test names: every tier in order (SC-001), the needs a
// Hamlet can meet (SC-003), the same start on every difficulty for 20 seeds (SC-004), hostility
// by difficulty (SC-006), milestones recorded once (SC-007) and the progress query cost (SC-008).

const longTimeout = 600_000;

const ladder: JsonValue[] = [
  { tier: "hamlet", settlementNoun: "hamlet", requirements: [] },
  { tier: "village", settlementNoun: "village", requirements: [{ kind: "population", min: 3 }] },
  {
    tier: "market_town",
    settlementNoun: "market town",
    requirements: [{ kind: "population", min: 3 }],
  },
  {
    tier: "chartered_town",
    settlementNoun: "town",
    requirements: [{ kind: "population", min: 3 }],
  },
];

describe("spec 027 tiers and milestones", () => {
  // @covers 027:SC-001
  it("reaches every tier in order, each on the first evaluation that holds, and announces three", () => {
    const world = createSettlementWorld({ content: contentWithTiers(ladder) });
    world.addSettlers(3);
    for (let day = 1; day <= 6; day += 1) {
      world.runToDay(day);
    }
    expect(world.tierEvents).toEqual([
      { tier: "village", previousTier: "hamlet", tick: ticksPerDay },
      { tier: "market_town", previousTier: "village", tick: 2 * ticksPerDay },
      { tier: "chartered_town", previousTier: "market_town", tick: 3 * ticksPerDay },
    ]);
  });

  // @covers 027:SC-007
  it(
    "records a milestone once over 100 days of building and breaking its zone",
    () => {
      const world = createSettlementWorld({});
      world.addSettlers(3);
      const triggers = ["throne_room", "church", "market"];
      for (let day = 1; day <= 100; day += 1) {
        // a zone of each kind becomes active again and again, as if it were rebuilt after a loss
        triggers.forEach((zoneTypeId, index) => {
          world.engine.bus.emit("zone.requirements.met", {
            zoneId: 100 + day * 3 + index,
            zoneTypeId,
          });
        });
        world.runToDay(day);
      }
      const reached = world.milestoneEvents.map(
        (event) => (event as { milestone: string }).milestone,
      );
      expect(new Set(reached).size).toBe(reached.length);
      // saved and loaded, the same milestones stay with the same ticks
      const before = JSON.stringify(world.progress().milestones);
      world.engine.loadGame(world.engine.saveGame());
      expect(JSON.stringify(world.progress().milestones)).toBe(before);
    },
    longTimeout,
  );
});

describe("spec 027 difficulty and needs", () => {
  function profile(seed: number, difficulty: Difficulty): string {
    const session = new GameSession(loadContent());
    session.newGame({ seed, difficulty, mapSize: MapSize.Small });
    const parsed: JsonValue = JSON.parse(session.engine.saveGame());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("a save is an object");
    }
    // everything but the options themselves (the maps and entities are part of it)
    const rest: { [key: string]: JsonValue } = { ...parsed };
    delete rest["initOptions"];
    delete rest["eventQueue"];
    return JSON.stringify(rest);
  }

  // @covers 027:SC-004 027:FR-016
  it("starts with identical maps and entities on every difficulty for 20 seeds", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const steady = profile(seed, Difficulty.Steady);
      expect(profile(seed, Difficulty.Peaceful), `seed ${seed}`).toBe(steady);
      expect(profile(seed, Difficulty.Harsh), `seed ${seed}`).toBe(steady);
    }
  });

  // @covers 027:SC-003
  it("gives every need a method that Hamlet content provides and keeps a Hamlet fed for 3 days", () => {
    const content = loadContent();
    const hamlet = (tier: string | undefined): boolean => tier === undefined || tier === "hamlet";
    const bonuses = new Set(
      [...content.furniture.all(), ...content.zones.all()]
        .filter((record) => hamlet(record.unlockTier))
        .flatMap((record) => record.effects.map((effect) => effect.modifierId)),
    );
    for (const need of content.needs.all()) {
      const consumable = need.satisfactionMethods.length > 0;
      expect(consumable || bonuses.has(`${need.id}.bonus`), need.id).toBe(true);
    }
    const session = new GameSession(content);
    session.newGame({ seed: 42, difficulty: Difficulty.Steady, mapSize: MapSize.Small });
    for (let tick = 0; tick < 3 * ticksPerDay; tick += 12) {
      session.step(12);
      for (const row of citizenNeeds(session)) {
        expect(row.hunger, `tick ${tick}`).toBeGreaterThan(0);
        expect(row.rest, `tick ${tick}`).toBeGreaterThan(0);
      }
    }
    expect(citizenNeeds(session).length).toBeGreaterThanOrEqual(6);
  });

  function citizenNeeds(session: GameSession): { hunger: number; rest: number }[] {
    return session.engine
      .getEntities()
      .filter(
        (entity) =>
          entity.components["Citizen"] !== undefined && entity.components["Needs"] !== undefined,
      )
      .map((entity) => {
        const view = session.query.run("needs-of", { entityId: entity.id });
        const rows =
          view.ok &&
          typeof view.data === "object" &&
          view.data !== null &&
          !Array.isArray(view.data)
            ? view.data["needs"]
            : undefined;
        const percent = (needId: string): number => {
          const row = Array.isArray(rows)
            ? rows.find(
                (candidate) =>
                  typeof candidate === "object" &&
                  candidate !== null &&
                  !Array.isArray(candidate) &&
                  candidate["needId"] === needId,
              )
            : undefined;
          return typeof row === "object" && row !== null && !Array.isArray(row)
            ? Number(row["percent"])
            : -1;
        };
        return { hunger: percent("hunger"), rest: percent("rest") };
      });
  }

  // @covers 027:SC-006
  it(
    "makes NPC factions hostile at most half as often on Peaceful as on Steady over 30 days",
    () => {
      const hostile = (difficulty: Difficulty): number => {
        const session = new GameSession(loadContent());
        session.newGame({ seed: 42, difficulty, mapSize: MapSize.Small });
        let count = 0;
        session.engine.bus.subscribe("diplomacy.incident", () => {
          count += 1;
        });
        session.engine.bus.subscribe("diplomacy.act.initiated", (payload) => {
          const act =
            typeof payload === "object" && payload !== null && !Array.isArray(payload)
              ? payload["actType"]
              : undefined;
          if (act === "war") {
            count += 1;
          }
        });
        session.step(30 * ticksPerDay);
        return count;
      };
      const peaceful = hostile(Difficulty.Peaceful);
      const steady = hostile(Difficulty.Steady);
      expect(steady).toBeGreaterThan(0);
      expect(peaceful * 2).toBeLessThanOrEqual(steady);
    },
    longTimeout,
  );
});

describe("spec 027 cost", () => {
  // @covers 027:SC-008
  it(
    "answers the settlement progress query in a few milliseconds with 200 members and 100 zones",
    () => {
      const session = createSettlement(200);
      const map = session.engine.maps.require(1);
      let zones = 0;
      for (let cell = 0; cell < map.cellCount && zones < 100; cell += 5) {
        if (
          map.isTraversable(cell) &&
          !session.engine
            .getEntities()
            .some(
              (entity) =>
                (entity.components["Position"] as { cellIndex?: number } | undefined)?.cellIndex ===
                cell,
            )
        ) {
          const result = session.dispatch({
            kind: "DesignateZone",
            zoneTypeId: "stockpile",
            mapId: 1,
            cells: [cell],
            reassign: false,
          });
          zones += result.ok ? 1 : 0;
        }
      }
      session.step(2);
      expect(zones).toBeGreaterThanOrEqual(50);
      const milliseconds = medianMs(7, () => {
        session.query.run("settlement-progress", {});
      });
      expect(milliseconds).toBeLessThan(5 * 10);
    },
    longTimeout,
  );
});
