import { describe, it, expect } from "vitest";
import { createFactionRegistry } from "../../src/registries/FactionRegistry.js";

describe("FactionRegistry", () => {
  const registry = createFactionRegistry();

  it("loads at least 12 factions (9 guilds + 3 religious)", () => {
    expect(registry.size).toBeGreaterThanOrEqual(12);
  });

  it("contains occupational (guild) factions", () => {
    const guilds = registry.filter((f) => f.factionType === "occupational");
    expect(guilds.length).toBeGreaterThanOrEqual(9);
  });

  it("contains religious factions", () => {
    const religious = registry.filter((f) => f.factionType === "religious");
    expect(religious.length).toBeGreaterThanOrEqual(3);
  });

  it("guild factions have membership criteria", () => {
    const smiths = registry.get("guild_smiths");
    expect(smiths.name).toBe("Blacksmith's Guild");
    expect(smiths.membershipCriteria).toBeDefined();
    expect(smiths.membershipCriteria!.skillId).toBe("smithing");
    expect(smiths.membershipCriteria!.minLevel).toBe(15);
  });

  it("religious factions have associated zones", () => {
    const parish = registry.get("parish_church");
    expect(parish.name).toBe("The Parish");
    expect(parish.associatedZones).toContain("chapel");
    expect(parish.associatedZones).toContain("church");
  });

  it("all factions have required fields", () => {
    for (const faction of registry.getAll()) {
      expect(faction.id.length).toBeGreaterThan(0);
      expect(faction.name.length).toBeGreaterThan(0);
      expect(faction.factionType.length).toBeGreaterThan(0);
      expect(faction.leaderTitle.length).toBeGreaterThan(0);
      expect(faction.disposition.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate IDs", () => {
    const all = registry.getAll();
    const ids = all.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
