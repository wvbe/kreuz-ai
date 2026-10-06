import { describe, expect, it } from "vitest";
import { loadContent } from "../../content/ContentLoader";
import { ContentTable } from "../../content/ContentTable";
import type { HumanoidPrototypeContent } from "../../content/schemas/characterSchemas";
import type { Entity } from "../../ecs/Entity";
import { needPriorityOrder, Role, roleOf } from "./rolePriority";
import type { RoleContentView } from "./rolePriority";

const content = loadContent();

function entity(prototype: string, skills: Record<string, number> = {}): Entity {
  return { id: 1, prototype, components: { Skills: { values: skills } } };
}

function contentWith(humanoid: HumanoidPrototypeContent): RoleContentView {
  return {
    needs: content.needs,
    humanoids: new ContentTable("humanoids", [humanoid], (record) => record.id),
  };
}

// @covers 013:FR-003 013:FR-008 013:SC-001
describe("roleOf", () => {
  it("is Worker for ordinary prototypes", () => {
    expect(roleOf(content, entity("farmer", { farming: 30_000 }))).toBe(Role.Worker);
    expect(roleOf(content, entity("unknown"))).toBe(Role.Worker);
  });

  it("is Guard when the dominant skill is combat", () => {
    expect(roleOf(content, entity("farmer", { combat: 50_000, farming: 30_000 }))).toBe(Role.Guard);
    expect(roleOf(content, entity("farmer", { combat: 10_000, farming: 30_000 }))).toBe(
      Role.Worker,
    );
  });

  it("is Merchant for prototypes that sell items", () => {
    const merchant = { ...content.humanoids.require("baker"), sellsItems: true };
    expect(roleOf(contentWith(merchant), entity("baker"))).toBe(Role.Merchant);
  });
});

describe("needPriorityOrder", () => {
  it("starts with hunger, rest, safety, social for workers and covers every need once", () => {
    const order = needPriorityOrder(content, entity("farmer", { farming: 30_000 }));
    expect(order).toEqual(["hunger", "rest", "safety", "social", "comfort", "faith"]);
  });

  it("puts safety first for guards (Guard: Safety > Rest > Hunger > Social)", () => {
    const order = needPriorityOrder(content, entity("farmer", { combat: 60_000 }));
    expect(order).toEqual(["safety", "rest", "hunger", "social", "comfort", "faith"]);
  });

  it("puts social first for merchants (Merchant: Social > Hunger > Rest > Safety)", () => {
    const merchant = { ...content.humanoids.require("baker"), sellsItems: true };
    const order = needPriorityOrder(contentWith(merchant), entity("baker"));
    expect(order).toEqual(["social", "hunger", "rest", "safety", "comfort", "faith"]);
  });

  it("uses the prototype's own needPriority when it authors one", () => {
    const custom = { ...content.humanoids.require("farmer"), needPriority: ["faith", "hunger"] };
    const order = needPriorityOrder(contentWith(custom), entity("farmer"));
    expect(order).toEqual(["faith", "hunger", "rest", "safety", "social", "comfort"]);
  });
});
