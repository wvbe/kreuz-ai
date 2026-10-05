import type { NameListContent } from "../content/schemas/characterSchemas";
import type { PrngStream } from "../engine/Prng";
import { fullName, lowestFreeOrdinal, sameName } from "./nameText";

/**
 * A name a living settlement citizen already holds.
 */
export type TakenName = {
  givenName: string;
  byname: string | null;
  nameOrdinal: number;
};

/**
 * A drawn name.
 */
export type DrawnName = {
  givenName: string;
  byname: string | null;
  nameOrdinal: number;
};

/**
 * Input of {@link drawName}.
 */
export type DrawNameOptions = {
  list: NameListContent;
  /**
   * The `identity.names` stream.
   */
  stream: PrngStream;
  /**
   * Chance of a byname in permille (`bynameChance`, 850).
   */
  bynameChancePermille: number;
  /**
   * Redraws allowed after a collision (`nameRedrawLimit`).
   */
  redrawLimit: number;
  /**
   * Names of the living citizens of the government faction.
   */
  taken: readonly TakenName[];
};

/**
 * Draws a name from a name list (spec 028 FR-004): one weighted given name, then a byname with
 * probability `bynameChance`. When the full name equals a taken one the draw is repeated up to
 * `redrawLimit` times; if the last draw still collides it is kept with the lowest free name
 * ordinal. Naming never fails and never loops; the number of draws depends only on the taken
 * names and the stream.
 *
 * @param options - See {@link DrawNameOptions}.
 * @returns The given name, byname and ordinal (0 when unique).
 */
export function drawName(options: DrawNameOptions): DrawnName {
  const names = options.list.givenNames.map((entry) => entry.name);
  const weights = options.list.givenNames.map((entry) => entry.weight);
  let givenName = "";
  let byname: string | null = null;
  for (let attempt = 0; attempt <= options.redrawLimit; attempt += 1) {
    givenName = options.stream.weighted(names, weights);
    byname = options.stream.chancePermille(options.bynameChancePermille)
      ? options.stream.choice(options.list.bynames)
      : null;
    const name = fullName(givenName, byname);
    if (!options.taken.some((other) => sameName(fullName(other.givenName, other.byname), name))) {
      return { givenName, byname, nameOrdinal: 0 };
    }
  }
  return {
    givenName,
    byname,
    nameOrdinal: ordinalFor(givenName, byname, options.taken),
  };
}

/**
 * The ordinal a name needs next to the taken names: 0 when nobody has it, else the lowest free
 * ordinal `>= 2` (spec 028 FR-004, also used by renames and fixed names, which do not redraw).
 *
 * @param givenName - Given name.
 * @param byname - Byname or null.
 * @param taken - Names of the living citizens of the government faction.
 * @returns The ordinal.
 */
export function ordinalFor(
  givenName: string,
  byname: string | null,
  taken: readonly TakenName[],
): number {
  const name = fullName(givenName, byname);
  const namesakes = taken.filter((other) =>
    sameName(fullName(other.givenName, other.byname), name),
  );
  return namesakes.length === 0
    ? 0
    : lowestFreeOrdinal(namesakes.map((other) => other.nameOrdinal));
}
