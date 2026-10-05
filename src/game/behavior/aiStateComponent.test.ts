import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { EcsErrorKind } from "../ecs/EcsError";
import { aiStateComponent } from "./aiStateComponent";

describe("aiStateComponent", () => {
  it("defaults to idle with no tree", () => {
    expect(aiStateComponent.defaults()).toEqual({
      treeId: null,
      currentNode: [],
      running: false,
      lastActionTick: 0,
    });
  });

  it("round-trips a running state through JSON and stays tiny (013 SC-009)", () => {
    const components = new ComponentRegistry();
    components.register(aiStateComponent);
    const state = { treeId: "villager", currentNode: [1, 0, 2], running: true, lastActionTick: 41 };
    const loaded = components.validate("AiState", JSON.parse(JSON.stringify(state)));
    expect(loaded).toEqual(state);
    expect(JSON.stringify(loaded).length).toBeLessThan(200);
  });

  it("rejects a stored path while not running, unknown fields and bad values", () => {
    const components = new ComponentRegistry();
    components.register(aiStateComponent);
    const base = { treeId: "villager", currentNode: [], running: false, lastActionTick: 0 };
    for (const bad of [
      { ...base, currentNode: [1] },
      { ...base, extra: 1 },
      { ...base, currentNode: [-1], running: true },
      { ...base, treeId: "" },
    ]) {
      expect(() => components.validate("AiState", bad)).toThrow(
        expect.objectContaining({ kind: EcsErrorKind.InvalidComponentData }),
      );
    }
  });
});
