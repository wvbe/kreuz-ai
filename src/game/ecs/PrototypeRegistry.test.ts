import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ComponentRegistry, defineComponent } from "./ComponentRegistry";
import { EcsError } from "./EcsError";
import { PrototypeRegistry, prototypeSchema } from "./PrototypeRegistry";

const positionSchema = z.object({ mapId: z.number().int(), cellIndex: z.number().int() }).strict();
const inventorySchema = z
  .object({ slotCount: z.number().int().min(1), items: z.array(z.string()) })
  .strict();

function createRegistries(): { components: ComponentRegistry; prototypes: PrototypeRegistry } {
  const components = new ComponentRegistry();
  components.register(
    defineComponent("Position", positionSchema, () => ({ mapId: 0, cellIndex: 0 })),
  );
  components.register(
    defineComponent("Inventory", inventorySchema, () => ({ slotCount: 4, items: [] })),
  );
  return { components, prototypes: new PrototypeRegistry(components) };
}

describe("prototypeSchema", () => {
  it("accepts snake_case ids and rejects other shapes", () => {
    expect(prototypeSchema.safeParse({ id: "wood_chest", components: {} }).success).toBe(true);
    expect(prototypeSchema.safeParse({ id: "WoodChest", components: {} }).success).toBe(false);
    expect(prototypeSchema.safeParse({ id: "ok", components: {}, extra: 1 }).success).toBe(false);
    expect(
      prototypeSchema.safeParse({ id: "ok", components: { Position: { cellIndex: 0.5 } } }).success,
    ).toBe(false);
  });
});

describe("PrototypeRegistry", () => {
  it("instantiates defaults, prototype overrides and spawn overrides in that order", () => {
    const { prototypes } = createRegistries();
    prototypes.register({
      id: "chest",
      components: { Position: {}, Inventory: { slotCount: 10 } },
    });
    expect(prototypes.instantiate("chest")).toEqual({
      Inventory: { slotCount: 10, items: [] },
      Position: { mapId: 0, cellIndex: 0 },
    });
    expect(Object.keys(prototypes.instantiate("chest"))).toEqual(["Inventory", "Position"]);
    expect(
      prototypes.instantiate("chest", { Inventory: { slotCount: 12 }, Position: { cellIndex: 7 } }),
    ).toEqual({
      Inventory: { slotCount: 12, items: [] },
      Position: { mapId: 0, cellIndex: 7 },
    });
  });

  it("makes instances independent of each other and of the registry", () => {
    const { prototypes } = createRegistries();
    prototypes.register({ id: "chest", components: { Inventory: { items: ["a"] } } });
    const first = prototypes.instantiate("chest");
    const second = prototypes.instantiate("chest");
    (first["Inventory"] as { items: string[] }).items.push("b");
    expect(second["Inventory"]).toEqual({ slotCount: 4, items: ["a"] });
    expect(prototypes.instantiate("chest")["Inventory"]).toEqual({ slotCount: 4, items: ["a"] });
  });

  it("rejects unknown components, invalid overrides, duplicates and bad ids at registration", () => {
    const { prototypes } = createRegistries();
    expect(() => prototypes.register({ id: "ghost", components: { Nope: {} } })).toThrow(EcsError);
    expect(() =>
      prototypes.register({ id: "bad", components: { Inventory: { slotCount: 0 } } }),
    ).toThrow(EcsError);
    expect(() =>
      prototypes.register({ id: "bad", components: { Inventory: { unknownField: 1 } } }),
    ).toThrow(EcsError);
    expect(() => prototypes.register({ id: "Bad-Id", components: {} })).toThrow(EcsError);
    prototypes.register({ id: "once", components: {} });
    expect(() => prototypes.register({ id: "once", components: {} })).toThrow(EcsError);
  });

  it("rejects unknown prototypes and overrides for components the prototype lacks", () => {
    const { prototypes } = createRegistries();
    prototypes.register({ id: "marker", components: { Position: {} } });
    expect(() => prototypes.instantiate("missing")).toThrow(EcsError);
    expect(() => prototypes.instantiate("marker", { Inventory: {} })).toThrow(EcsError);
    expect(() => prototypes.instantiate("marker", { Position: { cellIndex: 1.5 } })).toThrow(
      EcsError,
    );
  });

  it("registerAll loads a JSON list and reports bad lists", () => {
    const { prototypes } = createRegistries();
    prototypes.registerAll(
      JSON.parse(
        '[{"id":"a_thing","components":{"Position":{"mapId":2}}},{"id":"b_thing","components":{}}]',
      ),
    );
    expect(prototypes.ids()).toEqual(["a_thing", "b_thing"]);
    expect(prototypes.has("a_thing")).toBe(true);
    expect(prototypes.has("c_thing")).toBe(false);
    expect(prototypes.instantiate("a_thing")["Position"]).toEqual({ mapId: 2, cellIndex: 0 });
    expect(() => prototypes.registerAll({ id: "not-a-list" })).toThrow(EcsError);
    expect(() => prototypes.registerAll([{ id: 5 }])).toThrow(EcsError);
  });

  it("is per engine: another registry set starts empty", () => {
    const first = createRegistries();
    first.prototypes.register({ id: "only_here", components: {} });
    expect(createRegistries().prototypes.has("only_here")).toBe(false);
  });
});
