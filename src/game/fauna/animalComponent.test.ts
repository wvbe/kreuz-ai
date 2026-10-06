import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { EcsErrorKind } from "../ecs/EcsError";
import { AnimalKind } from "../content/contentTypes";
import { animalComponent } from "./animalComponent";

describe("animalComponent", () => {
  it("defaults to a fed wild animal with nothing scheduled", () => {
    expect(animalComponent.defaults()).toEqual({
      prototypeId: "unknown",
      kind: AnimalKind.Wild,
      hungerMilli: 0,
      nextProductTick: 0,
      attackReadyTick: 0,
    });
  });

  it("round-trips through JSON", () => {
    const components = new ComponentRegistry();
    components.register(animalComponent);
    const data = {
      prototypeId: "sheep",
      kind: "livestock",
      hungerMilli: 5000,
      nextProductTick: 900,
      attackReadyTick: 0,
    };
    expect(components.validate("Animal", JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects unknown kinds, fields and out-of-range hunger", () => {
    const components = new ComponentRegistry();
    components.register(animalComponent);
    const base = { ...animalComponent.defaults() };
    for (const bad of [
      { ...base, kind: "pet" },
      { ...base, extra: 1 },
      { ...base, hungerMilli: 100_001 },
    ]) {
      expect(() => components.validate("Animal", bad)).toThrow(
        expect.objectContaining({ kind: EcsErrorKind.InvalidComponentData }),
      );
    }
  });
});
