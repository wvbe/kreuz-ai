import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { Entity } from "../ecs/Entity";
import { deriveTitle } from "./deriveTitle";
import { TitleRank } from "./identityTypes";

const content = loadContent();

function citizen(levels: { [skillId: string]: number }): Entity {
  const values: { [skillId: string]: number } = {};
  for (const [skillId, level] of Object.entries(levels)) {
    values[skillId] = level * 1000;
  }
  return { id: 1, prototype: "peasant", components: { Skills: { values } } };
}

describe("deriveTitle", () => {
  // @covers 028:FR-007
  it("gives no title below the threshold and a Practitioner from level 20", () => {
    expect(deriveTitle(content, citizen({ baking: 10 }), null)).toBeNull();
    expect(deriveTitle(content, citizen({ baking: 19 }), null)).toBeNull();
    expect(deriveTitle(content, citizen({ baking: 20 }), null)).toEqual({
      skillId: "baking",
      rank: TitleRank.Practitioner,
      noun: "Baker",
      guildId: null,
    });
  });

  // @covers 028:FR-007
  it("gives a Master at the guild's master threshold, only for skills a guild uses", () => {
    expect(deriveTitle(content, citizen({ baking: 59 }), null)?.rank).toBe(TitleRank.Practitioner);
    expect(deriveTitle(content, citizen({ baking: 60 }), null)).toEqual({
      skillId: "baking",
      rank: TitleRank.Master,
      noun: "Baker",
      guildId: "guild_bakers",
    });
    expect(deriveTitle(content, citizen({ hauling: 90 }), null)).toEqual({
      skillId: "hauling",
      rank: TitleRank.Practitioner,
      noun: "Hauler",
      guildId: null,
    });
  });

  it("ranks a Master above a higher Practitioner skill", () => {
    const title = deriveTitle(content, citizen({ baking: 60, farming: 90 }), null);
    expect(title?.skillId).toBe("baking");
    expect(title?.rank).toBe(TitleRank.Master);
  });

  // @covers 028:FR-008
  it("breaks ties without a current title by level, then skill id ascending", () => {
    expect(deriveTitle(content, citizen({ farming: 40, carpentry: 40 }), null)?.skillId).toBe(
      "carpentry",
    );
    expect(deriveTitle(content, citizen({ farming: 40, carpentry: 41 }), null)?.skillId).toBe(
      "carpentry",
    );
    expect(deriveTitle(content, citizen({ farming: 42, carpentry: 41 }), null)?.skillId).toBe(
      "farming",
    );
  });

  // @covers 028:FR-008
  it("keeps the current title skill until another one leads by the switch margin", () => {
    const current = deriveTitle(content, citizen({ farming: 40 }), null);
    expect(current?.skillId).toBe("farming");
    expect(deriveTitle(content, citizen({ farming: 40, carpentry: 42 }), current)?.skillId).toBe(
      "farming",
    );
    expect(deriveTitle(content, citizen({ farming: 40, carpentry: 44 }), current)?.skillId).toBe(
      "farming",
    );
    expect(deriveTitle(content, citizen({ farming: 40, carpentry: 45 }), current)?.skillId).toBe(
      "carpentry",
    );
  });

  it("switches at once to a higher rank", () => {
    const current = deriveTitle(content, citizen({ farming: 80 }), null);
    expect(deriveTitle(content, citizen({ farming: 80, baking: 60 }), current)?.skillId).toBe(
      "baking",
    );
  });

  it("follows the current skill into its Master rank", () => {
    const current = deriveTitle(content, citizen({ baking: 59 }), null);
    expect(deriveTitle(content, citizen({ baking: 60 }), current)?.rank).toBe(TitleRank.Master);
  });
});
