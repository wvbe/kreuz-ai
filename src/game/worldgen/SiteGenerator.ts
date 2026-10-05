import { Prng } from "../engine/Prng";
import type { PrngStream } from "../engine/Prng";
import { WorldGenError, WorldGenErrorKind } from "./WorldGenError";
import { WorldTerrain } from "./WorldTerrain";

/**
 * Size class of a generated site (spec 009 `RoomSize`, renamed by DECISIONS D-33).
 */
export enum SiteSize {
  Small = "small",
  Medium = "medium",
  Large = "large",
}

/**
 * What a generated site is populated for (spec 009 `ScenarioType`).
 */
export enum SiteScenario {
  Trade = "trade",
  Interaction = "interaction",
  Navigation = "navigation",
}

/**
 * Options of {@link SiteGenerator.generate}; every field is optional.
 */
export type SiteOptions = {
  /**
   * Default medium.
   */
  size?: SiteSize;
  /**
   * Number of entities, at least 1 and at most a quarter of the cells. Default: 10 to 20 drawn
   * from the stream.
   */
  entityCount?: number | null;
  /**
   * Object density in permille, 0..1000; 500 (the default) gives 5 to 10 objects, 1000 up to 20.
   */
  objectDensity?: number;
  /**
   * Explicit seed 0..2^32-1 for a private generator. Without it the seed is drawn from the
   * `site.gen` stream and recorded in the result.
   */
  seed?: number;
  /**
   * Default trade.
   */
  scenario?: SiteScenario;
};

/**
 * The resolved parameters of a generated site. Feeding them back into `generate` reproduces the
 * site exactly.
 */
export type SiteParams = {
  size: SiteSize;
  entityCount: number | null;
  objectDensity: number;
  seed: number;
  scenario: SiteScenario;
};

/**
 * Role of a generated entity inside its scenario.
 */
export enum SiteRole {
  Merchant = "merchant",
  Customer = "customer",
  Worker = "worker",
  Wanderer = "wanderer",
}

/**
 * An entity to spawn: a humanoid prototype of the content pack on a walkable cell.
 */
export type SiteEntity = {
  prototypeId: string;
  role: SiteRole;
  cell: number;
};

/**
 * An object (furniture prototype id) on a walkable cell.
 */
export type SiteObject = {
  prototypeId: string;
  cell: number;
};

/**
 * A generated site: a populated square map as plain data (spec 009, DECISIONS D-33). Generating
 * does not touch any game state; `insertSite` puts it into an engine.
 */
export type GeneratedSite = {
  params: SiteParams;
  width: number;
  height: number;
  /**
   * Terrain id per cell, `y * width + x` (`floor_wood` everywhere; walls are entities).
   */
  cells: string[];
  /**
   * Cells that hold a wall entity, ascending.
   */
  walls: number[];
  entities: SiteEntity[];
  objects: SiteObject[];
};

const siteSides: Record<SiteSize, number> = {
  [SiteSize.Small]: 15,
  [SiteSize.Medium]: 25,
  [SiteSize.Large]: 40,
};

const maxLayoutAttempts = 8;
const maxSeed = 4294967295;

const scenarioEntities: Record<SiteScenario, readonly { prototypeId: string; role: SiteRole }[]> = {
  [SiteScenario.Trade]: [
    { prototypeId: "baker", role: SiteRole.Merchant },
    { prototypeId: "peasant", role: SiteRole.Customer },
    { prototypeId: "farmer", role: SiteRole.Customer },
  ],
  [SiteScenario.Interaction]: [
    { prototypeId: "carpenter", role: SiteRole.Worker },
    { prototypeId: "farmer", role: SiteRole.Worker },
    { prototypeId: "baker", role: SiteRole.Worker },
  ],
  [SiteScenario.Navigation]: [
    { prototypeId: "peasant", role: SiteRole.Wanderer },
    { prototypeId: "farmer", role: SiteRole.Wanderer },
  ],
};

const scenarioObjects: Record<SiteScenario, readonly string[]> = {
  [SiteScenario.Trade]: ["table", "chest"],
  [SiteScenario.Interaction]: ["workbench", "oven", "sawmill", "grinding_mill"],
  [SiteScenario.Navigation]: ["chest", "table"],
};

function neighborsOf(cell: number, width: number, height: number): number[] {
  const x = cell % width;
  const y = Math.floor(cell / width);
  const result: number[] = [];
  if (y > 0) {
    result.push(cell - width);
  }
  if (x > 0) {
    result.push(cell - 1);
  }
  if (x < width - 1) {
    result.push(cell + 1);
  }
  if (y < height - 1) {
    result.push(cell + width);
  }
  return result;
}

function isConnected(blocked: readonly boolean[], width: number, height: number): boolean {
  const open: number[] = [];
  for (let cell = 0; cell < blocked.length; cell += 1) {
    if (!blocked[cell]) {
      open.push(cell);
    }
  }
  if (open.length === 0) {
    return false;
  }
  const seen = new Set<number>([open[0] as number]);
  const queue = [open[0] as number];
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of neighborsOf(queue[head] as number, width, height)) {
      if (!blocked[next] && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === open.length;
}

/**
 * The quick site generator (spec 009 "Quick Room Generator", renamed per DECISIONS D-33): a
 * deterministic square-grid fixture of walls, floor, 10 to 20 entities and 5 to 10 objects for a
 * trade, interaction or navigation scenario. Not stateless: the instance owns the `site.gen`
 * stream it draws unseeded seeds from. `generate` returns data and never mutates game state.
 */
export class SiteGenerator {
  /**
   * Creates a generator.
   *
   * @param stream - The engine's `site.gen` stream, used only when `generate` gets no seed.
   */
  constructor(private readonly stream: PrngStream) {}

  /**
   * Generates one site. The result depends only on the resolved params; layout is validated
   * (all walkable cells connected, entities and objects on distinct walkable cells) and
   * redrawn up to 8 times.
   *
   * @param options - Size, counts, density, seed and scenario.
   * @returns The site, with the seed actually used in `params`.
   */
  generate(options: SiteOptions = {}): GeneratedSite {
    const size = options.size ?? SiteSize.Medium;
    const scenario = options.scenario ?? SiteScenario.Trade;
    const objectDensity = options.objectDensity ?? 500;
    const entityCount = options.entityCount ?? null;
    this.validate(options, size, scenario, objectDensity);
    const seed = options.seed ?? this.stream.nextU32();
    const params: SiteParams = { size, entityCount, objectDensity, seed, scenario };
    const rng = Prng.create({ seed }).stream(`site.layout.${scenario}`);
    for (let attempt = 0; attempt < maxLayoutAttempts; attempt += 1) {
      const site = this.attempt(params, rng);
      if (site !== null) {
        return site;
      }
    }
    throw new WorldGenError(
      WorldGenErrorKind.GenerationFailed,
      `no valid ${scenario} site of size ${size} for seed ${seed} after ${maxLayoutAttempts} attempts`,
    );
  }

  private validate(
    options: SiteOptions,
    size: SiteSize,
    scenario: SiteScenario,
    objectDensity: number,
  ): void {
    const problems: string[] = [];
    if (!Object.hasOwn(siteSides, size)) {
      problems.push(`Invalid size: '${String(size)}'. Valid values: small, medium, large.`);
    }
    if (!Object.hasOwn(scenarioEntities, scenario)) {
      problems.push(
        `Invalid scenario: '${String(scenario)}'. Valid values: trade, interaction, navigation.`,
      );
    }
    if (!Number.isInteger(objectDensity) || objectDensity < 0 || objectDensity > 1000) {
      problems.push(`Invalid objectDensity: ${objectDensity}. Must be an integer from 0 to 1000.`);
    }
    if (
      options.seed !== undefined &&
      !(Number.isInteger(options.seed) && options.seed >= 0 && options.seed <= maxSeed)
    ) {
      problems.push(`Invalid seed: ${options.seed}. Must be an integer from 0 to 4294967295.`);
    }
    if (options.entityCount !== undefined && options.entityCount !== null) {
      const side = siteSides[size] ?? 0;
      const limit = Math.floor((side * side) / 4);
      if (!Number.isInteger(options.entityCount) || options.entityCount < 1) {
        problems.push(
          `Invalid entityCount: ${options.entityCount}. Must be an integer of at least 1.`,
        );
      } else if (options.entityCount > limit) {
        problems.push(
          `Invalid entityCount: ${options.entityCount}. A ${size} site holds at most ${limit}.`,
        );
      }
    }
    if (problems.length > 0) {
      throw new WorldGenError(WorldGenErrorKind.InvalidOptions, problems.join(" "));
    }
  }

  private attempt(params: SiteParams, rng: PrngStream): GeneratedSite | null {
    const side = siteSides[params.size];
    const width = side;
    const height = side;
    const blocked: boolean[] = new Array<boolean>(width * height).fill(false);
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          blocked[y * width + x] = true;
        }
      }
    }
    const strips = this.layoutInterior(params, rng, blocked, width, height);
    if (!isConnected(blocked, width, height)) {
      return null;
    }
    const entityCount = params.entityCount ?? rng.nextInt(10, 20);
    const entities = this.placeEntities(params, rng, blocked, strips, entityCount);
    if (entities === null) {
      return null;
    }
    const taken = new Set(entities.map((entity) => entity.cell));
    const walls: number[] = [];
    for (let cell = 0; cell < blocked.length; cell += 1) {
      if (blocked[cell]) {
        walls.push(cell);
      }
    }
    const objects = this.placeObjects(params, rng, blocked, taken, width, height);
    return {
      params,
      width,
      height,
      cells: new Array<string>(width * height).fill(WorldTerrain.FloorWood),
      walls,
      entities,
      objects,
    };
  }

  private layoutInterior(
    params: SiteParams,
    rng: PrngStream,
    blocked: boolean[],
    width: number,
    height: number,
  ): number[][] {
    if (params.scenario === SiteScenario.Navigation) {
      const parts = params.size === SiteSize.Small ? 2 : params.size === SiteSize.Medium ? 3 : 4;
      const strips: number[][] = Array.from({ length: parts }, () => []);
      const wallColumns: number[] = [];
      for (let part = 1; part < parts; part += 1) {
        const column = Math.floor((width * part) / parts);
        wallColumns.push(column);
        const gapStart = rng.nextInt(1, height - 3);
        for (let y = 1; y < height - 1; y += 1) {
          if (y < gapStart || y > gapStart + 1) {
            blocked[y * width + column] = true;
          }
        }
      }
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const strip = wallColumns.filter((column) => column <= x).length;
          if (!blocked[y * width + x]) {
            (strips[strip] as number[]).push(y * width + x);
          }
        }
      }
      return strips;
    }
    const obstacles = Math.floor((width * height) / 60);
    for (let obstacle = 0; obstacle < obstacles; obstacle += 1) {
      const blockWidth = rng.nextInt(1, 2);
      const blockHeight = rng.nextInt(1, 2);
      const left = rng.nextInt(2, width - 2 - blockWidth);
      const top = rng.nextInt(2, height - 2 - blockHeight);
      for (let y = top; y < top + blockHeight; y += 1) {
        for (let x = left; x < left + blockWidth; x += 1) {
          blocked[y * width + x] = true;
        }
      }
    }
    return [];
  }

  private placeEntities(
    params: SiteParams,
    rng: PrngStream,
    blocked: readonly boolean[],
    strips: readonly number[][],
    count: number,
  ): SiteEntity[] | null {
    const taken = new Set<number>();
    const palette = scenarioEntities[params.scenario];
    const entities: SiteEntity[] = [];
    const walkable: number[] = [];
    for (let cell = 0; cell < blocked.length; cell += 1) {
      if (!blocked[cell]) {
        walkable.push(cell);
      }
    }
    for (let index = 0; index < count; index += 1) {
      const pool = (
        strips.length > 0 ? (strips[index % strips.length] as number[]) : walkable
      ).filter((cell) => !taken.has(cell));
      if (pool.length === 0) {
        return null;
      }
      const cell = rng.choice(pool);
      taken.add(cell);
      const kind = palette[rng.nextInt(0, palette.length - 1)] as (typeof palette)[number];
      entities.push({ prototypeId: kind.prototypeId, role: kind.role, cell });
    }
    return entities;
  }

  private placeObjects(
    params: SiteParams,
    rng: PrngStream,
    blocked: boolean[],
    taken: ReadonlySet<number>,
    width: number,
    height: number,
  ): SiteObject[] {
    // Placed objects stay in `blocked` so later objects keep the floor connected around them.
    const maxObjects = Math.max(1, Math.floor((params.objectDensity * 20 + 500) / 1000));
    const count = rng.nextInt(Math.max(1, Math.floor(maxObjects / 2)), maxObjects);
    const catalog = scenarioObjects[params.scenario];
    const objects: SiteObject[] = [];
    const used = new Set(taken);
    for (let index = 0; index < count; index += 1) {
      const options: number[] = [];
      for (let cell = 0; cell < blocked.length; cell += 1) {
        if (!blocked[cell] && !used.has(cell)) {
          options.push(cell);
        }
      }
      let placed = false;
      while (!placed && options.length > 0) {
        const cell = (
          options.splice(rng.nextInt(0, options.length - 1), 1) as number[]
        )[0] as number;
        blocked[cell] = true;
        if (isConnected(blocked, width, height)) {
          objects.push({ prototypeId: rng.choice(catalog), cell });
          used.add(cell);
          placed = true;
        } else {
          blocked[cell] = false;
        }
      }
    }
    return objects;
  }
}
