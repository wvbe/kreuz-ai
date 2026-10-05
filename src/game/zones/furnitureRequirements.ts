import { FurnitureRefKind } from "../content/contentTypes";
import type { ZoneTypeContent } from "../content/schemas/economySchemas";
import { ZoneError, ZoneErrorKind } from "./ZoneError";
import type { FurnitureAlternative, FurnitureMatch, FurnitureRequirement } from "./zoneTypes";

/**
 * A furniture piece inside a zone, as far as requirements care: its id and the tags of its
 * content record.
 */
export type FurniturePiece = {
  furnitureId: string;
  tags: readonly string[];
};

/**
 * How well one requirement is met: `met`, and the alternative that is closest to being met with
 * what is required and present (the gap report uses it).
 */
export type RequirementCheck = {
  met: boolean;
  required: number;
  present: number;
};

const nameRule = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

function invalid(text: string, why: string): ZoneError {
  return new ZoneError(
    ZoneErrorKind.InvalidRequirement,
    `furniture requirement "${text}" is not valid: ${why}`,
  );
}

function parseAlternative(text: string, words: string[]): FurnitureAlternative {
  const rest = [...words];
  let count = 1;
  const first = rest[0];
  if (first !== undefined && /^\d+x$/.test(first)) {
    count = Number(first.slice(0, -1));
    rest.shift();
    if (count < 1) {
      throw invalid(text, "a count must be at least 1");
    }
  }
  let perTiles: number | null = null;
  const perAt = rest.indexOf("per");
  if (perAt >= 0) {
    const amount = rest[perAt + 1];
    if (
      amount === undefined ||
      !/^\d+$/.test(amount) ||
      Number(amount) < 1 ||
      rest[perAt + 2] !== "tiles" ||
      rest.length !== perAt + 3
    ) {
      throw invalid(text, 'a density reads "per <N> tiles" with N at least 1');
    }
    perTiles = Number(amount);
    rest.length = perAt;
  }
  let match: FurnitureMatch;
  const target = rest[0];
  if (rest.length === 2 && target === "any") {
    match = { tag: rest[1] ?? "" };
  } else if (rest.length === 1 && target !== undefined && target.startsWith("tag:")) {
    match = { tag: target.slice(4) };
  } else if (rest.length === 1 && target !== undefined && target.startsWith("id:")) {
    match = { id: target.slice(3) };
  } else {
    throw invalid(text, 'name the furniture as "any <tag>", "tag:<tag>" or "id:<furniture id>"');
  }
  const name = "tag" in match ? match.tag : match.id;
  if (!nameRule.test(name)) {
    throw invalid(text, `"${name}" is not a content id`);
  }
  return { match, count, perTiles };
}

/**
 * Parses the text form of a furniture requirement into the typed predicate (DECISIONS D-11).
 * Grammar (keywords lowercase, words separated by blanks):
 *
 * ```
 * expression  := requirement ("and" requirement)*
 * requirement := alternative ("or" alternative)*
 * alternative := [N "x"] target ["per" M "tiles"]
 * target      := "any" tag | "tag:" tag | "id:" furnitureId
 * ```
 *
 * `and` separates requirements (all must hold), `or` separates alternatives (one must hold),
 * `any bed` is `1x tag:bed`, and `per M tiles` is a density: N pieces for every started M tiles.
 *
 * @param text - The expression, for example `any oven and 2x id:crate or 2x id:chest`.
 * @returns The requirements in order; throws `ZoneError` `InvalidRequirement` for bad text.
 */
export function parseFurnitureRequirements(text: string): FurnitureRequirement[] {
  const words = text.trim().split(/\s+/);
  if (text.trim() === "") {
    throw invalid(text, "the expression is empty");
  }
  const requirements: FurnitureRequirement[] = [];
  let alternatives: FurnitureAlternative[] = [];
  let current: string[] = [];
  let expectOperand = true;
  const finishAlternative = (): void => {
    if (current.length === 0) {
      throw invalid(text, "an operator needs an alternative on both sides");
    }
    alternatives.push(parseAlternative(text, current));
    current = [];
  };
  for (const word of words) {
    if (word === "and" || word === "or") {
      finishAlternative();
      if (word === "and") {
        requirements.push({ alternatives });
        alternatives = [];
      }
      expectOperand = true;
      continue;
    }
    current.push(word);
    expectOperand = false;
  }
  if (expectOperand) {
    throw invalid(text, "an operator needs an alternative on both sides");
  }
  finishAlternative();
  requirements.push({ alternatives });
  return requirements;
}

/**
 * Writes a requirement in the text form, always with the count and the kind (`2x tag:bed or 1x
 * id:chest`); {@link parseFurnitureRequirements} reads it back.
 *
 * @param requirement - The requirement.
 * @returns The text.
 */
export function formatRequirement(requirement: FurnitureRequirement): string {
  return requirement.alternatives
    .map((alternative) => {
      const target =
        "tag" in alternative.match ? `tag:${alternative.match.tag}` : `id:${alternative.match.id}`;
      const density = alternative.perTiles === null ? "" : ` per ${alternative.perTiles} tiles`;
      return `${alternative.count}x ${target}${density}`;
    })
    .join(" or ");
}

/**
 * The typed furniture requirements of a zone type of the content pack (the authored
 * `furnitureRequirements`: inner list = alternatives, outer list = AND).
 *
 * @param zoneType - The zone type record.
 * @returns The requirements; empty for a type without furniture needs.
 */
export function compileRequirements(zoneType: ZoneTypeContent): FurnitureRequirement[] {
  return zoneType.furnitureRequirements.map((alternatives) => ({
    alternatives: alternatives.map((alternative) => ({
      match:
        alternative.kind === FurnitureRefKind.Id
          ? { id: alternative.ref }
          : { tag: alternative.ref },
      count: alternative.count,
      perTiles: alternative.perTiles ?? null,
    })),
  }));
}

/**
 * Pieces an alternative needs in a zone of a given size: the flat count, or for a density the
 * count for every started `perTiles` tiles (at least one group).
 *
 * @param alternative - The alternative.
 * @param tileCount - Tiles of the zone.
 * @returns The required number of pieces.
 */
export function requiredPieces(alternative: FurnitureAlternative, tileCount: number): number {
  if (alternative.perTiles === null) {
    return alternative.count;
  }
  return alternative.count * Math.max(1, Math.ceil(tileCount / alternative.perTiles));
}

/**
 * How many of the pieces an alternative matches (by furniture id or by tag).
 *
 * @param alternative - The alternative.
 * @param pieces - The furniture in the zone.
 * @returns The number of matching pieces.
 */
export function countMatching(
  alternative: FurnitureAlternative,
  pieces: readonly FurniturePiece[],
): number {
  const match = alternative.match;
  return pieces.filter((piece) =>
    "tag" in match ? piece.tags.includes(match.tag) : piece.furnitureId === match.id,
  ).length;
}

/**
 * Checks one requirement against the furniture of a zone: it is met when any alternative has
 * enough pieces. When it is not, the result describes the alternative with the smallest
 * shortage (the first one on ties), so a gap can say "needs 2, has 1".
 *
 * @param requirement - The requirement.
 * @param tileCount - Tiles of the zone (for densities).
 * @param pieces - The furniture in the zone.
 * @returns Whether it is met and the closest alternative's required and present numbers.
 */
export function checkRequirement(
  requirement: FurnitureRequirement,
  tileCount: number,
  pieces: readonly FurniturePiece[],
): RequirementCheck {
  let best: RequirementCheck | null = null;
  for (const alternative of requirement.alternatives) {
    const required = requiredPieces(alternative, tileCount);
    const present = countMatching(alternative, pieces);
    if (present >= required) {
      return { met: true, required, present };
    }
    if (best === null || required - present < best.required - best.present) {
      best = { met: false, required, present };
    }
  }
  return best ?? { met: true, required: 0, present: 0 };
}
