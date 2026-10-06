import { describe, expect, it } from "vitest";
import { buildSiteComponent, buildSiteDataSchema, siteMaterialSchema } from "./buildSiteComponent";
import { SiteStatus } from "./constructionTypes";

// @covers 016:FR-002 016:FR-015
describe("buildSiteComponent", () => {
  it("is named BuildSite and defaults to a planned construction", () => {
    expect(buildSiteComponent.name).toBe("BuildSite");
    const data = buildSiteComponent.defaults();
    expect(data.status).toBe(SiteStatus.Planned);
    expect(data.builderId).toBeNull();
  });

  it("round-trips through JSON", () => {
    const data = {
      ...buildSiteComponent.defaults(),
      prototypeId: "oven",
      status: SiteStatus.Building,
      required: [{ materialId: "stone_block", quantity: 6 }],
      durationTicks: 48,
      progress: 5,
      builderId: 3,
      startedTick: 10,
    };
    expect(buildSiteDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects final statuses, a builder outside the building status and progress past the end", () => {
    const base = buildSiteComponent.defaults();
    expect(buildSiteDataSchema.safeParse({ ...base, status: SiteStatus.Done }).success).toBe(false);
    expect(buildSiteDataSchema.safeParse({ ...base, builderId: 3, startedTick: 1 }).success).toBe(
      false,
    );
    expect(buildSiteDataSchema.safeParse({ ...base, progress: 1 }).success).toBe(false);
    expect(
      buildSiteDataSchema.safeParse({ ...base, status: SiteStatus.Building, startedTick: 3 })
        .success,
    ).toBe(false);
    expect(buildSiteDataSchema.safeParse({ ...base, x: 1 }).success).toBe(false);
  });

  it("validates materials strictly", () => {
    expect(siteMaterialSchema.safeParse({ materialId: "nails", quantity: 2 }).success).toBe(true);
    expect(siteMaterialSchema.safeParse({ materialId: "nails", quantity: 0 }).success).toBe(false);
  });
});
