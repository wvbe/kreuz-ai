import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineComponent } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";
import { getComponent, hasComponent, requireComponent } from "./Entity";
import type { Entity, WithComponent } from "./Entity";

const inventory = defineComponent(
  "Inventory",
  z.object({ coins: z.number().int() }).strict(),
  () => ({ coins: 0 }),
);
const position = defineComponent(
  "Position",
  z.object({ cellIndex: z.number().int() }).strict(),
  () => ({ cellIndex: 0 }),
);

function getBalance(entity: WithComponent<typeof inventory>): number {
  return entity.components.Inventory.coins;
}

const entity: Entity = { id: 1, prototype: "citizen", components: { Inventory: { coins: 7 } } };

describe("hasComponent", () => {
  it("is true only for present components", () => {
    expect(hasComponent(entity, inventory)).toBe(true);
    expect(hasComponent(entity, position)).toBe(false);
  });

  it("narrows the type so required-component functions compile", () => {
    if (hasComponent(entity, inventory)) {
      expect(getBalance(entity)).toBe(7);
      expectTypeOf(entity.components.Inventory.coins).toBeNumber();
    }
    // @ts-expect-error an entity not narrowed to Inventory cannot be passed to getBalance
    getBalance(entity);
  });

  it("narrows cumulatively across two components", () => {
    const both: Entity = {
      id: 2,
      prototype: "citizen",
      components: { Inventory: { coins: 1 }, Position: { cellIndex: 3 } },
    };
    if (hasComponent(both, inventory) && hasComponent(both, position)) {
      expect(both.components.Inventory.coins + both.components.Position.cellIndex).toBe(4);
    } else {
      expect.unreachable();
    }
  });
});

describe("getComponent", () => {
  it("returns the typed live data or undefined", () => {
    const data = getComponent(entity, inventory);
    expect(data).toEqual({ coins: 7 });
    expect(data).toBe(entity.components.Inventory);
    expect(getComponent(entity, position)).toBeUndefined();
  });
});

describe("requireComponent", () => {
  it("returns data or throws MissingComponent", () => {
    expect(requireComponent(entity, inventory).coins).toBe(7);
    try {
      requireComponent(entity, position);
      expect.unreachable();
    } catch (failure) {
      expect(failure).toBeInstanceOf(EcsError);
      expect((failure as EcsError).kind).toBe(EcsErrorKind.MissingComponent);
    }
  });
});
