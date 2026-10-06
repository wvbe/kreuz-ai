import { describe, expect, it } from "vitest";
import { zoneComponent, zoneDataSchema } from "./zoneComponent";
import { ZoneStatus } from "./zoneTypes";

// @covers 015:FR-012
describe("zoneComponent", () => {
  it("is named Zone and defaults to an empty inactive stockpile zone", () => {
    expect(zoneComponent.name).toBe("Zone");
    expect(zoneComponent.defaults()).toMatchObject({
      zoneTypeId: "stockpile",
      tiles: [],
      active: false,
      status: ZoneStatus.Inactive,
      filter: null,
    });
  });

  it("validates the defaults and rejects unknown fields and statuses", () => {
    expect(zoneDataSchema.safeParse(zoneComponent.defaults()).success).toBe(true);
    expect(zoneDataSchema.safeParse({ ...zoneComponent.defaults(), x: 1 }).success).toBe(false);
    expect(zoneDataSchema.safeParse({ ...zoneComponent.defaults(), status: "on" }).success).toBe(
      false,
    );
  });
});
