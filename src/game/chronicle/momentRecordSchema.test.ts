import { describe, expect, it } from "vitest";
import { momentRecordSchema } from "./momentRecordSchema";

const record = {
  momentId: 3,
  tick: 40,
  kind: "became_finest",
  prominence: "major",
  entityId: 9,
  nameSnapshot: "Ansel the Baker",
  params: { skillId: "baking", noun: "Baker", level: 41 },
};

describe("momentRecordSchema", () => {
  // @covers 028:FR-014
  it("round trips a record through JSON", () => {
    expect(momentRecordSchema.parse(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it("rejects a prominence that is not the kind's, unknown fields and non-integer params", () => {
    expect(momentRecordSchema.safeParse({ ...record, prominence: "minor" }).success).toBe(false);
    expect(momentRecordSchema.safeParse({ ...record, extra: 1 }).success).toBe(false);
    expect(momentRecordSchema.safeParse({ ...record, params: { level: 1.5 } }).success).toBe(false);
    expect(momentRecordSchema.safeParse({ ...record, momentId: 0 }).success).toBe(false);
  });
});
