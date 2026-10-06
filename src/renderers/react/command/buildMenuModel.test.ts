import { describe, expect, it } from "vitest";
import {
  BuildCategory,
  categoryOf,
  groupBuildMenu,
  lockBadge,
  usesWallTool,
} from "./buildMenuModel";
import type { BuildMenuEntry } from "./buildMenuModel";

function entry(
  id: string,
  tags: string[],
  locked = false,
  tier: string | null = "hamlet",
): BuildMenuEntry {
  return {
    id,
    name: id.replace("_", " "),
    tags,
    materials: [],
    constructionTicks: 10,
    unlockTier: tier,
    locked,
    unlockText: locked ? `Unlocks at ${tier ?? ""}` : null,
  };
}

describe("categoryOf", () => {
  it("reads the category from the tags", () => {
    expect(categoryOf(["wall", "structure"])).toBe(BuildCategory.Structure);
    expect(categoryOf(["oven", "workstation"])).toBe(BuildCategory.Workstations);
    expect(categoryOf(["storage", "wood"])).toBe(BuildCategory.Storage);
    expect(categoryOf(["altar", "religious"])).toBe(BuildCategory.Religion);
    expect(categoryOf(["bed", "comfort"])).toBe(BuildCategory.Comfort);
    expect(categoryOf(["well", "utility", "water"])).toBe(BuildCategory.Utility);
    expect(categoryOf(["notice_post"])).toBe(BuildCategory.Other);
  });
});

describe("groupBuildMenu", () => {
  const menu = [
    entry("forge", ["forge", "workstation"], true, "village"),
    entry("oven", ["oven", "workstation"]),
    entry("chest", ["storage"]),
    entry("wall", ["wall", "structure"]),
  ];

  it("groups in display order, unlocked entries first, and drops empty groups", () => {
    const groups = groupBuildMenu(menu, "");
    expect(groups.map((group) => group.category)).toEqual([
      BuildCategory.Structure,
      BuildCategory.Workstations,
      BuildCategory.Storage,
    ]);
    expect(groups[1]?.entries.map((item) => item.id)).toEqual(["oven", "forge"]);
  });

  it("filters by name, id or tag, ignoring case", () => {
    expect(
      groupBuildMenu(menu, "OVEN").flatMap((group) => group.entries.map((item) => item.id)),
    ).toEqual(["oven"]);
    expect(groupBuildMenu(menu, "workstation").flatMap((group) => group.entries)).toHaveLength(2);
    expect(groupBuildMenu(menu, "nothing")).toEqual([]);
  });
});

describe("lockBadge and usesWallTool", () => {
  it("shows the unlock text only for locked entries", () => {
    expect(lockBadge(entry("oven", []))).toBeNull();
    expect(lockBadge(entry("forge", [], true, "village"))).toBe("Unlocks at village");
    expect(lockBadge({ ...entry("x", [], true, null), unlockText: null })).toBe(
      "Unlocks at a later tier",
    );
  });

  it("uses the rectangle tool for walls only", () => {
    expect(usesWallTool("wall")).toBe(true);
    expect(usesWallTool("door")).toBe(false);
  });
});
