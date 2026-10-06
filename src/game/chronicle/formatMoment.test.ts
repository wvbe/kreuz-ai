import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { MomentProminence } from "./chronicleTypes";
import type { MomentParams, MomentRecord } from "./chronicleTypes";
import { formatMoment } from "./formatMoment";

const content = loadContent();

function moment(kind: string, params: MomentParams, tick = 12 * 288): MomentRecord {
  return {
    momentId: 1,
    tick,
    kind: kind as MomentRecord["kind"],
    prominence: MomentProminence.Minor,
    entityId: 9,
    nameSnapshot: "Ansel the Baker",
    params,
  };
}

describe("formatMoment", () => {
  it("renders the name snapshot and the noun of the skill", () => {
    expect(
      formatMoment(
        content,
        moment("became_finest", { skillId: "baking", noun: "Baker", level: 41 }),
        "village",
      ),
    ).toBe("Ansel the Baker hath become the village's finest baker.");
  });

  it("renders skill names, guild names, homes, renames and the 1-based day", () => {
    expect(formatMoment(content, moment("first_work", { skillId: "baking" }), "hamlet")).toBe(
      "Ansel the Baker finished a first piece of Baking work.",
    );
    expect(
      formatMoment(
        content,
        moment("joined_guild", { factionId: 4, guildName: "Bakers' guild" }),
        "hamlet",
      ),
    ).toBe("Ansel the Baker joined the Bakers' guild.");
    expect(
      formatMoment(
        content,
        moment("home_improved", { dwellingId: 5, dwellingLevel: "timber_framed_house" }),
        "village",
      ),
    ).toBe("Ansel the Baker's home is now a timber framed house.");
    expect(formatMoment(content, moment("renamed", { previousName: "Odo" }), "hamlet")).toBe(
      "Odo took the name Ansel the Baker.",
    );
    expect(formatMoment(content, moment("died", { journalExcerpt: "" }), "hamlet")).toBe(
      "Ansel the Baker has died.",
    );
  });

  it("uses the tier a record names, else the tier in force, for the settlement noun", () => {
    const tier = moment("tier_reached", { tier: "village", previousTier: "hamlet" });
    expect(formatMoment(content, tier, "hamlet")).toBe("The village has grown.");
    const milestone = moment("settlement_milestone", { milestone: "first-guild-founded" });
    expect(formatMoment(content, milestone, "hamlet")).toBe(
      "The hamlet reached a milestone: first guild founded.",
    );
  });

  it("is empty for a kind without a template", () => {
    expect(formatMoment(content, moment("nonsense", {}), "hamlet")).toBe("");
  });
});
