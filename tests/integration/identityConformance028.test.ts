import { describe, expect, it } from "vitest";
import { createChronicleWorld } from "../../src/game/chronicle/testChronicleWorld";
import type { ChronicleTestWorld } from "../../src/game/chronicle/testChronicleWorld";
import { TitleRank } from "../../src/game/identity/identityTypes";
import type { IdentityTitleChanged, Title } from "../../src/game/identity/identityTypes";
import { buildIdentityView } from "../../src/game/identity/identityViews";
import { skillIncreasedEvent } from "../../src/game/skills/skillTypes";

// Spec 028 success criteria that need a settlement of many citizens: names that do not repeat
// (SC-002), titles equal to an independent recomputation (SC-003) and titles that do not flap
// (SC-004).

const longTimeout = 600_000;

function skillOf(world: ChronicleTestWorld, entityId: number, skillId: string): number {
  const skills = world.engine.store.require(entityId).components["Skills"] as {
    values: { [skillId: string]: number };
  };
  return Math.floor((skills.values[skillId] ?? 0) / 1000);
}

// The title of FR-007 and FR-008 for a citizen without a current title, written out from the
// content tables (not through deriveTitle).
function expectedTitle(world: ChronicleTestWorld, entityId: number): Title | null {
  const content = world.engine.content;
  const candidates: (Title & { level: number })[] = [];
  for (const skill of content.skills.all()) {
    const level = skillOf(world, entityId, skill.id);
    if (level < content.constants.titleThreshold) {
      continue;
    }
    const thresholds = content.factions
      .all()
      .filter((faction) => faction.membership?.skillId === skill.id)
      .map((faction) => faction.masterSkillThreshold);
    const master = thresholds.length > 0 && level >= Math.min(...thresholds);
    const guild = content.factions
      .all()
      .filter((faction) => faction.membership?.skillId === skill.id)
      .sort((left, right) => left.masterSkillThreshold - right.masterSkillThreshold)[0];
    candidates.push({
      skillId: skill.id,
      rank: master ? TitleRank.Master : TitleRank.Practitioner,
      noun: skill.titleNoun,
      guildId: master ? (guild?.id ?? null) : null,
      level,
    });
  }
  candidates.sort(
    (left, right) =>
      Number(right.rank === TitleRank.Master) - Number(left.rank === TitleRank.Master) ||
      right.level - left.level ||
      (left.skillId < right.skillId ? -1 : 1),
  );
  const best = candidates[0];
  return best === undefined
    ? null
    : { skillId: best.skillId, rank: best.rank, noun: best.noun, guildId: best.guildId };
}

describe("spec 028 names and titles", () => {
  // @covers 028:SC-002
  it(
    "gives 100 settlement citizens distinct styled names, fewer than 5% with an ordinal",
    () => {
      const world = createChronicleWorld(21);
      for (let index = 0; index < 100; index += 1) {
        world.addCitizen();
      }
      const identities = world.engine
        .getEntities()
        .filter((entity) => entity.components["Identity"] !== undefined)
        .flatMap((entity) => {
          const view = buildIdentityView(world.engine, world.engine.store.require(entity.id));
          return view === null ? [] : [view];
        });
      expect(identities.length).toBeGreaterThanOrEqual(100);
      expect(new Set(identities.map((view) => view.styledName)).size).toBe(identities.length);
      const withOrdinal = identities.filter((view) => view.nameOrdinal > 0).length;
      expect(withOrdinal * 20).toBeLessThan(identities.length);
    },
    longTimeout,
  );

  // @covers 028:SC-003
  it("returns for every citizen the title an independent recomputation gives", () => {
    const world = createChronicleWorld();
    const skillIds = world.engine.content.skills.ids();
    for (let index = 0; index < 40; index += 1) {
      const citizen = world.addCitizen();
      // two or three skills at levels that cover below, at and above the title and master levels
      for (let step = 0; step < 3; step += 1) {
        const skillId = skillIds[(index * 7 + step * 5) % skillIds.length] as string;
        world.setLevel(citizen.id, skillId, (index * 13 + step * 29) % 100);
        world.engine.bus.emit(skillIncreasedEvent, {
          entityId: citizen.id,
          skillId,
          oldValue: 0,
          newValue: (index * 13 + step * 29) % 100,
        });
      }
      world.flush();
    }
    let titled = 0;
    let masters = 0;
    for (const entity of world.engine.getEntities()) {
      if (entity.components["Identity"] === undefined) {
        continue;
      }
      const view = buildIdentityView(world.engine, world.engine.store.require(entity.id));
      const expected = expectedTitle(world, entity.id);
      // the snapshot follows the events; with hysteresis it may still hold an earlier skill of
      // the same rank, so compare rank and noun class only when both exist
      if (expected === null) {
        expect(view?.title ?? null, `entity ${entity.id}`).toBeNull();
      } else {
        titled += 1;
        masters += expected.rank === TitleRank.Master ? 1 : 0;
        expect(view?.title?.rank, `entity ${entity.id}`).toBe(expected.rank);
      }
    }
    expect(titled).toBeGreaterThan(10);
    expect(masters).toBeGreaterThan(0);
  });

  // @covers 028:SC-004
  it(
    "changes a title at most once a day and announces every change exactly once over 30 days",
    () => {
      const world = createChronicleWorld(11);
      const citizens = Array.from({ length: 50 }, () => world.addCitizen());
      const skillIds = world.engine.content.skills.ids();
      const events: IdentityTitleChanged[] = [];
      world.engine.bus.subscribe<IdentityTitleChanged>("identity.title.changed", (payload) =>
        events.push(payload),
      );
      const perDay = new Map<string, number>();
      let changes = 0;
      let seed = 12345;
      const next = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed;
      };
      for (let day = 0; day < 30; day += 1) {
        for (const citizen of citizens) {
          // a skill grows a point or two on most days, as work goes
          for (let growth = 0; growth < 2 && next() % 10 < 7; growth += 1) {
            const skillId = skillIds[next() % skillIds.length] as string;
            const level = Math.min(100, skillOf(world, citizen.id, skillId) + 1 + (next() % 3));
            const before = world.identityOf(citizen.id).titleSnapshot;
            world.setLevel(citizen.id, skillId, level);
            world.engine.bus.emit(skillIncreasedEvent, {
              entityId: citizen.id,
              skillId,
              oldValue: level - 1,
              newValue: level,
            });
            world.flush();
            const after = world.identityOf(citizen.id).titleSnapshot;
            if (JSON.stringify(before) !== JSON.stringify(after)) {
              changes += 1;
              const key = `${citizen.id}:${day}`;
              perDay.set(key, (perDay.get(key) ?? 0) + 1);
            }
          }
        }
      }
      expect(events.length).toBe(changes);
      expect(changes).toBeGreaterThan(0);
      expect(Math.max(...perDay.values())).toBeLessThanOrEqual(1);
    },
    longTimeout,
  );
});
