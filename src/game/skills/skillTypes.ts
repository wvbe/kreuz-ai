import type { ContentRegistries } from "../content/ContentRegistries";

/**
 * Data of the `Skills` component: accumulated experience per skill id as milli-percent
 * `0..100000` (DECISIONS D-04; the level is `floor(value / 1000)`). Absent skills are 0.
 */
export type SkillsData = {
  values: { [skillId: string]: number };
};

/**
 * Data of the `Traits` component: the immutable trait ids of a character, ascending.
 */
export type TraitsData = {
  ids: string[];
};

/**
 * What a piece of work declares about skills: the `skillId` of a recipe or job type record
 * (`null` when the work uses no skill). Recipes and job types of the content pack fit as they are.
 */
export type WorkRef = {
  readonly skillId: string | null;
};

/**
 * The part of the content registries the skill functions read, so tests can pass small tables.
 */
export type SkillContentView = {
  readonly skills: ContentRegistries["skills"];
  readonly traits: ContentRegistries["traits"];
  readonly recipes: ContentRegistries["recipes"];
};

/**
 * Highest skill value: level 100 in milli-percent.
 */
export const maxSkillMilli = 100_000;

/**
 * Milli-percent per skill level.
 */
export const milliPerLevel = 1000;

/**
 * Highest skill level.
 */
export const maxSkillLevel = 100;

/**
 * Event emitted by the system that executes work, once per completed claim (DECISIONS D-08).
 */
export const skillWorkCompletedEvent = "skill.work.completed";

/**
 * Event emitted when the integer level of a skill rises (spec 020 FR-013).
 */
export const skillIncreasedEvent = "skill.increased";

/**
 * Payload of `skill.work.completed`.
 */
export type SkillWorkCompleted = {
  entityId: number;
  skillId: string;
};

/**
 * Payload of `skill.increased`; the values are levels (`floor`), not milli-percent.
 */
export type SkillIncreased = {
  entityId: number;
  skillId: string;
  oldValue: number;
  newValue: number;
};

/**
 * PRNG stream that draws procedural traits (DECISIONS D-20, stream registry).
 */
export const traitStreamName = "content.traits";

/**
 * PRNG stream that rolls bonus output (DECISIONS D-20, stream registry).
 */
export const skillOutputStreamName = "skill.output";

/**
 * Skill id whose trait modifiers apply to trade margins (DECISIONS D-12, D-20).
 */
export const tradingSkillId = "trading";

/**
 * Weights for the procedural trait draw: one, two or three traits with the
 * permille weights 50 / 35 / 15 (DECISIONS D-20).
 */
export const traitCountWeights: readonly number[] = [50, 35, 15];
