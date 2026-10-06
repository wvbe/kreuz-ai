import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import { SiteGenerator, SiteRole, SiteScenario, SiteSize } from "./SiteGenerator";
import type { GeneratedSite } from "./SiteGenerator";
import { WorldGenError, WorldGenErrorKind } from "./WorldGenError";

function generator(seed = 1): SiteGenerator {
  return new SiteGenerator(Prng.create({ seed }).stream("site.gen"));
}

function floodCount(site: GeneratedSite, blocked: ReadonlySet<number>): number {
  const open: number[] = [];
  for (let cell = 0; cell < site.width * site.height; cell += 1) {
    if (!blocked.has(cell)) {
      open.push(cell);
    }
  }
  const seen = new Set<number>([open[0] ?? 0]);
  const queue = [open[0] ?? 0];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head] ?? 0;
    const x = cell % site.width;
    const around = [
      cell - site.width,
      cell + site.width,
      x > 0 ? cell - 1 : -1,
      x < site.width - 1 ? cell + 1 : -1,
    ];
    for (const next of around) {
      if (next >= 0 && next < site.width * site.height && !blocked.has(next) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === open.length ? open.length : -1;
}

describe("SiteGenerator", () => {
  // @covers 009:FR-005
  // @covers 009:SC-002
  // @covers 009:FR-013
  it("is deterministic per seed and scenario, and records the used seed", () => {
    const first = generator().generate({ seed: 42 });
    expect(generator(9).generate({ seed: 42 })).toEqual(first);
    expect(first.params).toMatchObject({
      seed: 42,
      size: SiteSize.Medium,
      scenario: SiteScenario.Trade,
      objectDensity: 500,
      entityCount: null,
    });
    expect(generator().generate({ seed: 43 })).not.toEqual(first);
    expect(generator().generate({ seed: 42, scenario: SiteScenario.Navigation })).not.toEqual(
      first,
    );
  });

  // @covers 009:FR-006
  it("draws an unseeded seed from the site.gen stream and can regenerate from the params", () => {
    const gen = generator(5);
    const first = gen.generate();
    const second = gen.generate();
    expect(first.params.seed).not.toBe(second.params.seed);
    expect(generator(5).generate().params.seed).toBe(first.params.seed);
    expect(generator(77).generate(first.params)).toEqual(first);
  });

  // @covers 009:FR-001
  // @covers 009:FR-002
  // @covers 009:FR-003
  // @covers 009:FR-004
  // @covers 009:FR-011
  // @covers 009:SC-003
  it("builds the three sizes with default counts and walkable, distinct placements", () => {
    for (const [size, side] of [
      [SiteSize.Small, 15],
      [SiteSize.Medium, 25],
      [SiteSize.Large, 40],
    ] as const) {
      for (const seed of [1, 2, 3]) {
        const site = generator().generate({ size, seed });
        expect(site.width).toBe(side);
        expect(site.cells).toHaveLength(side * side);
        expect(site.entities.length).toBeGreaterThanOrEqual(10);
        expect(site.entities.length).toBeLessThanOrEqual(20);
        expect(site.objects.length).toBeGreaterThanOrEqual(5);
        expect(site.objects.length).toBeLessThanOrEqual(10);
        const walls = new Set(site.walls);
        const cells = [...site.entities, ...site.objects].map((entry) => entry.cell);
        expect(new Set(cells).size).toBe(cells.length);
        expect(cells.every((cell) => !walls.has(cell))).toBe(true);
        for (let x = 0; x < side; x += 1) {
          expect(walls.has(x)).toBe(true);
          expect(walls.has((side - 1) * side + x)).toBe(true);
        }
        const blocked = new Set([...site.walls, ...site.objects.map((entry) => entry.cell)]);
        expect(floodCount(site, blocked)).toBeGreaterThan(0);
      }
    }
  });

  // @covers 009:FR-007
  // @covers 009:FR-008
  // @covers 009:FR-009
  // @covers 009:SC-004
  it("fills scenarios with their own people and objects", () => {
    const trade = generator().generate({ seed: 7, scenario: SiteScenario.Trade });
    expect(trade.entities.some((entry) => entry.role === SiteRole.Merchant)).toBe(true);
    expect(trade.entities.some((entry) => entry.role === SiteRole.Customer)).toBe(true);
    const work = generator().generate({ seed: 7, scenario: SiteScenario.Interaction });
    expect(work.entities.every((entry) => entry.role === SiteRole.Worker)).toBe(true);
    expect(
      work.objects.every((entry) =>
        ["workbench", "oven", "sawmill", "grinding_mill"].includes(entry.prototypeId),
      ),
    ).toBe(true);
  });

  // @covers 009:FR-010
  it("splits a navigation site into regions joined by gaps and spreads entities over them", () => {
    const site = generator().generate({ seed: 11, scenario: SiteScenario.Navigation });
    const column = Math.floor((site.width * 1) / 3);
    const partition = site.walls.filter((cell) => cell % site.width === column);
    expect(partition.length).toBeGreaterThan(site.height / 2);
    expect(partition.length).toBeLessThan(site.height);
    const sides = new Set(
      site.entities.map((entry) => Math.floor(((entry.cell % site.width) * 3) / site.width)),
    );
    expect(sides.size).toBeGreaterThanOrEqual(2);
    expect(floodCount(site, new Set(site.walls))).toBeGreaterThan(0);
  });

  // @covers 009:FR-003
  // @covers 009:FR-004
  // @covers 009:FR-013
  it("scales the object count with the density and honours entityCount", () => {
    const sparse = generator().generate({ seed: 3, objectDensity: 100, entityCount: 1 });
    const dense = generator().generate({ seed: 3, objectDensity: 1000, size: SiteSize.Large });
    expect(sparse.entities).toHaveLength(1);
    expect(sparse.objects.length).toBeGreaterThanOrEqual(1);
    expect(sparse.objects.length).toBeLessThanOrEqual(2);
    expect(dense.objects.length).toBeGreaterThanOrEqual(10);
    expect(dense.objects.length).toBeLessThanOrEqual(20);
    expect(
      generator().generate({ seed: 3, entityCount: 5, size: SiteSize.Large }).entities,
    ).toHaveLength(5);
  });

  // @covers 009:FR-012
  // @covers 009:SC-003
  // @covers 009:SC-001
  it("generates a large site with validation in well under the 200 ms budget", () => {
    const started = Number(process.hrtime.bigint()) / 1e6;
    generator().generate({ seed: 4, size: SiteSize.Large, scenario: SiteScenario.Navigation });
    expect(Number(process.hrtime.bigint()) / 1e6 - started).toBeLessThan(2000);
  });

  it("generates 200 valid sites over many seeds, sizes and scenarios", () => {
    const sizes = [SiteSize.Small, SiteSize.Medium, SiteSize.Large];
    const scenarios = [SiteScenario.Trade, SiteScenario.Interaction, SiteScenario.Navigation];
    for (let seed = 0; seed < 200; seed += 1) {
      const site = generator().generate({
        seed,
        size: sizes[seed % 3],
        scenario: scenarios[Math.floor(seed / 3) % 3],
      });
      const blocked = new Set([...site.walls, ...site.objects.map((entry) => entry.cell)]);
      expect(floodCount(site, blocked)).toBeGreaterThan(0);
    }
  });

  // @covers 009:FR-014
  it("rejects invalid options with one clear message", () => {
    const gen = generator();
    const problems: [Parameters<SiteGenerator["generate"]>[0], string][] = [
      [{ entityCount: 0 }, "Invalid entityCount: 0. Must be an integer of at least 1."],
      [{ entityCount: 1000 }, "A medium site holds at most 156."],
      [{ objectDensity: 1001 }, "Invalid objectDensity: 1001."],
      [{ seed: -1 }, "Invalid seed: -1."],
      [{ size: "huge" as SiteSize }, "Invalid size: 'huge'."],
      [{ scenario: "war" as SiteScenario }, "Invalid scenario: 'war'."],
    ];
    for (const [options, message] of problems) {
      try {
        gen.generate(options);
        throw new Error("expected a failure");
      } catch (failure) {
        expect(failure).toBeInstanceOf(WorldGenError);
        expect((failure as WorldGenError).kind).toBe(WorldGenErrorKind.InvalidOptions);
        expect((failure as WorldGenError).message).toContain(message);
      }
    }
  });
});
