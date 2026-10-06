import { describe, expect, it } from "vitest";
import {
  contentIdSchema,
  countSchema,
  dottedIdSchema,
  fractionSchema,
  levelSchema,
  materialAmountSchema,
  milliSchema,
  percentSchema,
  permilleSchema,
  positiveSchema,
  signedMilliSchema,
} from "./fieldSchemas";

describe("field schemas", () => {
  // @covers 022:FR-019
  it("validates ids", () => {
    expect(contentIdSchema.safeParse("oak_log").success).toBe(true);
    expect(contentIdSchema.safeParse("Oak").success).toBe(false);
    expect(contentIdSchema.safeParse("oak__log").success).toBe(false);
    expect(dottedIdSchema.safeParse("farm.harvest").success).toBe(true);
    expect(dottedIdSchema.safeParse("farm").success).toBe(false);
  });

  it("converts decimals to milli and permille", () => {
    expect(milliSchema.parse(0.5)).toBe(500);
    expect(milliSchema.safeParse(-1).success).toBe(false);
    expect(milliSchema.safeParse(0.0001).success).toBe(false);
    expect(signedMilliSchema.parse(-1.2)).toBe(-1200);
    expect(percentSchema.parse(20)).toBe(20000);
    expect(percentSchema.safeParse(101).success).toBe(false);
    expect(permilleSchema.parse(1.3)).toBe(1300);
    expect(fractionSchema.parse(0.85)).toBe(850);
    expect(fractionSchema.safeParse(1.5).success).toBe(false);
  });

  // @covers 022:FR-020
  it("validates plain integers", () => {
    expect(countSchema.safeParse(0).success).toBe(true);
    expect(positiveSchema.safeParse(0).success).toBe(false);
    expect(levelSchema.safeParse(100).success).toBe(true);
    expect(levelSchema.safeParse(101).success).toBe(false);
    expect(levelSchema.safeParse(1.5).success).toBe(false);
  });

  it("validates material amounts strictly", () => {
    expect(materialAmountSchema.safeParse({ materialId: "bread", quantity: 2 }).success).toBe(true);
    expect(materialAmountSchema.safeParse({ materialId: "bread", quantity: 0 }).success).toBe(
      false,
    );
    expect(
      materialAmountSchema.safeParse({ materialId: "bread", quantity: 1, extra: 1 }).success,
    ).toBe(false);
  });
});
