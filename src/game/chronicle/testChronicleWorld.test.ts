import { describe, expect, it } from "vitest";
import { createChronicleWorld } from "./testChronicleWorld";

describe("createChronicleWorld", () => {
  it("adds named citizens of the government and records their arrival", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    expect(world.identityOf(citizen.id).givenName).not.toBe("");
    expect(world.ofKind("arrived").map((record) => record.entityId)).toEqual([citizen.id]);
    expect(world.chronicle()).toEqual([]);
  });

  it("sets skill levels and fails for entities without the parts", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    world.setLevel(citizen.id, "baking", 21);
    expect(
      (citizen.components["Skills"] as { values: { [id: string]: number } }).values["baking"],
    ).toBe(21_000);
    expect(() => world.identityOf(1)).toThrow(/no identity/);
    expect(() => world.setLevel(1, "baking", 1)).toThrow(/no skills/);
    world.flush();
  });
});
