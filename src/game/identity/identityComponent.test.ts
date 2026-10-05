import { describe, expect, it } from "vitest";
import { identityComponent, identityDataSchema } from "./identityComponent";
import { TitleRank } from "./identityTypes";

describe("identityComponent", () => {
  it("defaults to an unnamed identity on the common list", () => {
    expect(identityComponent.name).toBe("Identity");
    expect(identityComponent.defaults()).toEqual({
      givenName: "",
      byname: null,
      nameOrdinal: 0,
      nameListId: "common_13c",
      titleSnapshot: null,
      seenSkills: [],
    });
  });

  it("round trips JSON with a title snapshot", () => {
    const data = {
      givenName: "Ansel",
      byname: "atte Brook",
      nameOrdinal: 2,
      nameListId: "common_13c",
      titleSnapshot: {
        skillId: "baking",
        rank: TitleRank.Master,
        noun: "Baker",
        guildId: "guild_bakers",
      },
      seenSkills: ["baking", "farming"],
    };
    expect(identityDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects bad ordinals, unsorted skills, unknown ranks and unknown fields", () => {
    const base = identityComponent.defaults();
    expect(identityDataSchema.safeParse({ ...base, nameOrdinal: -1 }).success).toBe(false);
    expect(identityDataSchema.safeParse({ ...base, nameOrdinal: 1.5 }).success).toBe(false);
    expect(identityDataSchema.safeParse({ ...base, seenSkills: ["b", "a"] }).success).toBe(false);
    expect(
      identityDataSchema.safeParse({
        ...base,
        titleSnapshot: { skillId: "baking", rank: "king", noun: "Baker", guildId: null },
      }).success,
    ).toBe(false);
    expect(identityDataSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
