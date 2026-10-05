import { z } from "zod";
import { MapSize } from "../map/mapSize";

/**
 * Difficulty levels (spec 027; spec 006 FR-016 renamed `normal`/`hard` to `steady`/`harsh`).
 */
export enum Difficulty {
  Peaceful = "peaceful",
  Steady = "steady",
  Harsh = "harsh",
}

/**
 * Zod schema of the root `initOptions` key: the options the game was created with. Unknown
 * fields are ignored (stripped), unlike every other save record (DECISIONS D-05, spec 007).
 */
export const initOptionsSchema = z.object({
  seed: z.number().int().min(0).max(0xffffffff),
  difficulty: z.enum(Difficulty),
  startingTier: z.string().nullable(),
  mapSize: z.enum(MapSize).nullable(),
});

/**
 * The options a game was created with, stored in every save so a load reproduces the setup.
 */
export type InitOptionsData = z.infer<typeof initOptionsSchema>;
