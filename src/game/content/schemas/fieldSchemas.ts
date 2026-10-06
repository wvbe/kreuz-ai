import { z } from "zod";
import { FixedUnit, fixedPointSchema } from "../../engine/fixedPoint";

/**
 * Lowercase snake_case content id (spec 022 FR-019).
 */
export const contentIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, "ids are lowercase snake_case");

/**
 * Dot-namespaced snake_case id used for jobs and modifiers, e.g. `farm.harvest`.
 */
export const dottedIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "ids are dot-namespaced snake_case");

/**
 * Non-negative authored decimal converted to milli units (x1000) at load.
 */
export const milliSchema = fixedPointSchema(FixedUnit.Milli).pipe(z.number().int().min(0));

/**
 * Authored decimal of either sign converted to milli units (x1000), e.g. modifier amounts where
 * `1` means 1.0 or one point.
 */
export const signedMilliSchema = fixedPointSchema(FixedUnit.Milli).pipe(z.number().int());

/**
 * Percent authored as a decimal in `0..100` and stored as milli-percent `0..100000`.
 */
export const percentSchema = fixedPointSchema(FixedUnit.Milli).pipe(
  z.number().int().min(0).max(100000),
);

/**
 * Non-negative authored ratio (1.0 is normal) converted to permille (x1000) at load.
 */
export const permilleSchema = fixedPointSchema(FixedUnit.Permille).pipe(z.number().int().min(0));

/**
 * Authored ratio of either sign converted to permille (x1000), e.g. an additive output bonus of
 * `-0.3`.
 */
export const signedPermilleSchema = fixedPointSchema(FixedUnit.Permille).pipe(z.number().int());

/**
 * Ratio in `0..1` authored as a decimal and stored as permille `0..1000`.
 */
export const fractionSchema = fixedPointSchema(FixedUnit.Permille).pipe(
  z.number().int().min(0).max(1000),
);

/**
 * Non-negative integer.
 */
export const countSchema = z.number().int().min(0);

/**
 * Positive integer.
 */
export const positiveSchema = z.number().int().min(1);

/**
 * Skill level or threshold on the authored `0..100` scale.
 */
export const levelSchema = z.number().int().min(0).max(100);

/**
 * A material id with a positive quantity, used for inputs, outputs, costs and equipment.
 */
export const materialAmountSchema = z
  .object({ materialId: contentIdSchema, quantity: positiveSchema })
  .strict();

/**
 * A material amount as the loaded registries hold it.
 */
export type MaterialAmount = z.infer<typeof materialAmountSchema>;
