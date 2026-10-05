import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { EntityStore } from "../ecs/EntityStore";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { EventBus } from "../engine/EventBus";
import { IdCounters } from "../engine/IdCounters";
import { aiStateComponent } from "./aiStateComponent";
import { BehaviorError, BehaviorErrorKind } from "./BehaviorError";
import { BehaviorHandlerRegistry } from "./BehaviorHandlerRegistry";
import { BehaviorInterpreter } from "./BehaviorInterpreter";
import { BehaviorTreeRegistry } from "./BehaviorTreeRegistry";
import { BehaviorNodeType, NodeStatus } from "./behaviorTypes";
import type { BehaviorNode, BehaviorTreeDefinition } from "./behaviorTypes";

function condition(id: string): BehaviorNode {
  return { type: BehaviorNodeType.Condition, id };
}

function action(id: string, params?: { [key: string]: string | number }): BehaviorNode {
  return params
    ? { type: BehaviorNodeType.Action, id, params }
    : { type: BehaviorNodeType.Action, id };
}

function sequence(...children: BehaviorNode[]): BehaviorNode {
  return { type: BehaviorNodeType.Sequence, children };
}

function selector(...children: BehaviorNode[]): BehaviorNode {
  return { type: BehaviorNodeType.Selector, children };
}

type Setup = ReturnType<typeof createSetup>;

function createSetup(trees: BehaviorTreeDefinition[]) {
  const bus = new EventBus();
  const components = new ComponentRegistry();
  components.register(aiStateComponent);
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({ id: "villager", components: { AiState: {} } });
  const store = new EntityStore({ components, prototypes, counters: new IdCounters(), bus });
  const handlers = new BehaviorHandlerRegistry();
  const log: string[] = [];
  const flags = new Set<string>();
  const runningFor = new Map<string, number>();
  handlers.registerCondition("is_starving", () =>
    flags.has("starving") ? NodeStatus.Success : NodeStatus.Failure,
  );
  handlers.registerCondition("is_tired", () =>
    flags.has("tired") ? NodeStatus.Success : NodeStatus.Failure,
  );
  for (const name of ["beg", "work", "sleep", "find_food", "eat"]) {
    handlers.registerAction(name, (context) => {
      log.push(`${name}@${context.tick}`);
      return NodeStatus.Success;
    });
  }
  // `haul` keeps running for `ticks` calls, then succeeds.
  handlers.registerAction("haul", (context) => {
    const key = `${context.entityId}`;
    const left = (runningFor.get(key) ?? Number(context.params["ticks"] ?? 2)) - 1;
    log.push(`haul@${context.tick}:${left}`);
    if (left > 0) {
      runningFor.set(key, left);
      return NodeStatus.Running;
    }
    runningFor.delete(key);
    return NodeStatus.Success;
  });
  handlers.registerAction("fail", () => NodeStatus.Failure);
  const registry = new BehaviorTreeRegistry(handlers);
  registry.registerAll(trees);
  const interpreter = new BehaviorInterpreter({ store, bus, trees: registry, handlers });
  const villager = store.spawn("villager").id;
  return { interpreter, store, registry, handlers, log, flags, villager, bus };
}

function aiOf(setup: Setup): {
  treeId: string | null;
  currentNode: number[];
  running: boolean;
  lastActionTick: number;
} {
  const entity = setup.store.require(setup.villager);
  return entity.components["AiState"] as never;
}

describe("BehaviorInterpreter selector and sequence", () => {
  const conditional: BehaviorTreeDefinition = {
    id: "villager",
    root: selector(sequence(condition("is_starving"), action("beg")), action("work")),
  };

  it("runs 'if starving then beg, else work' (spec 013 US6.3)", () => {
    const setup = createSetup([conditional]);
    setup.interpreter.setTree(setup.villager, "villager");
    expect(setup.interpreter.tick(setup.villager, 1)).toEqual({
      status: NodeStatus.Success,
      path: [],
    });
    setup.flags.add("starving");
    expect(setup.interpreter.tick(setup.villager, 2).status).toBe(NodeStatus.Success);
    expect(setup.log).toEqual(["work@1", "beg@2"]);
  });

  it("fails a sequence at the first failing child and a selector with no succeeding child", () => {
    const setup = createSetup([
      { id: "stuck", root: sequence(action("work"), action("fail"), action("sleep")) },
      { id: "hopeless", root: selector(action("fail"), condition("is_tired")) },
    ]);
    setup.interpreter.setTree(setup.villager, "stuck");
    expect(setup.interpreter.tick(setup.villager, 1).status).toBe(NodeStatus.Failure);
    expect(setup.log).toEqual(["work@1"]);
    setup.interpreter.setTree(setup.villager, "hopeless");
    expect(setup.interpreter.tick(setup.villager, 2).status).toBe(NodeStatus.Failure);
  });

  it("runs a lone leaf as the root", () => {
    const setup = createSetup([{ id: "just_work", root: action("work") }]);
    setup.interpreter.setTree(setup.villager, "just_work");
    expect(setup.interpreter.tick(setup.villager, 4)).toEqual({
      status: NodeStatus.Success,
      path: [],
    });
  });

  it("passes node params to the handler and records the last action tick", () => {
    const setup = createSetup([{ id: "slow", root: sequence(action("haul", { ticks: 1 })) }]);
    setup.interpreter.setTree(setup.villager, "slow");
    setup.interpreter.tick(setup.villager, 7);
    expect(setup.log).toEqual(["haul@7:0"]);
    expect(aiOf(setup).lastActionTick).toBe(7);
  });
});

describe("BehaviorInterpreter running state", () => {
  const tree: BehaviorTreeDefinition = {
    id: "chore",
    root: sequence(
      condition("is_tired"),
      selector(
        action("fail"),
        sequence(action("find_food"), action("haul", { ticks: 3 }), action("eat")),
      ),
    ),
  };

  it("stores the running path and resumes at the running leaf instead of the root", () => {
    const setup = createSetup([tree]);
    setup.flags.add("tired");
    setup.interpreter.setTree(setup.villager, "chore");
    const first = setup.interpreter.tick(setup.villager, 1);
    expect(first).toEqual({ status: NodeStatus.Running, path: [1, 1, 1] });
    expect(aiOf(setup)).toMatchObject({ running: true, currentNode: [1, 1, 1] });
    setup.flags.delete("tired");
    expect(setup.interpreter.tick(setup.villager, 2).status).toBe(NodeStatus.Running);
    expect(setup.interpreter.tick(setup.villager, 3).status).toBe(NodeStatus.Success);
    expect(setup.log).toEqual(["find_food@1", "haul@1:2", "haul@2:1", "haul@3:0", "eat@3"]);
    expect(aiOf(setup)).toMatchObject({ running: false, currentNode: [] });
  });

  it("restarts from the root after the tree finished", () => {
    const setup = createSetup([{ id: "short", root: sequence(action("work"), action("eat")) }]);
    setup.interpreter.setTree(setup.villager, "short");
    setup.interpreter.tick(setup.villager, 1);
    setup.interpreter.tick(setup.villager, 2);
    expect(setup.log).toEqual(["work@1", "eat@1", "work@2", "eat@2"]);
  });

  it("round-trips the running state through JSON and resumes the same leaf", () => {
    const setup = createSetup([tree]);
    setup.flags.add("tired");
    setup.interpreter.setTree(setup.villager, "chore");
    setup.interpreter.tick(setup.villager, 1);
    const saved = JSON.stringify(setup.store.serialize());
    const other = createSetup([tree]);
    other.store.restore(JSON.parse(saved));
    expect(other.store.serialize()).toEqual(JSON.parse(saved));
    other.flags.add("tired");
    expect(other.interpreter.tick(setup.villager, 2)).toEqual({
      status: NodeStatus.Running,
      path: [1, 1, 1],
    });
    // Only the leaf was resumed: nothing before it (find_food) ran again.
    expect(other.log).toHaveLength(1);
    expect(other.log[0]).toMatch(/^haul@2:/);
  });

  it("rejects saved paths that do not fit the tree and ticking without a tree", () => {
    const setup = createSetup([tree]);
    expect(() => setup.interpreter.tick(setup.villager, 1)).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.NoTree }),
    );
    setup.interpreter.setTree(setup.villager, "chore");
    const aiState = aiOf(setup);
    aiState.running = true;
    aiState.currentNode = [9];
    expect(() => setup.interpreter.tick(setup.villager, 1)).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.InvalidState }),
    );
    aiState.currentNode = [1];
    expect(() => setup.interpreter.tick(setup.villager, 1)).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.InvalidState }),
    );
  });

  it("requires an AiState component and a registered tree", () => {
    const setup = createSetup([tree]);
    expect(() => setup.interpreter.setTree(setup.villager, "unknown_tree")).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.UnknownTree }),
    );
    expect(() => setup.interpreter.setTree(999, "chore")).toThrow();
    const bare = new BehaviorError(BehaviorErrorKind.NoTree, "x");
    expect(bare.name).toBe("BehaviorError");
  });

  it("switches trees at runtime and resets the running state", () => {
    const setup = createSetup([tree, { id: "idle", root: action("work") }]);
    setup.flags.add("tired");
    setup.interpreter.setTree(setup.villager, "chore");
    setup.interpreter.tick(setup.villager, 1);
    setup.interpreter.setTree(setup.villager, "idle");
    expect(aiOf(setup)).toMatchObject({ treeId: "idle", running: false, currentNode: [] });
    expect(setup.interpreter.tick(setup.villager, 2).status).toBe(NodeStatus.Success);
  });
});

describe("BehaviorInterpreter sub-trees", () => {
  const trees: BehaviorTreeDefinition[] = [
    { id: "delivery", root: sequence(action("find_food"), action("haul", { ticks: 2 })) },
    {
      id: "daily",
      root: sequence(action("work"), action("run_tree", { treeId: "delivery" }), action("eat")),
    },
  ];

  it("expands run_tree and extends the running path into the referenced tree via index 0", () => {
    const setup = createSetup(trees);
    setup.interpreter.setTree(setup.villager, "daily");
    expect(setup.interpreter.tick(setup.villager, 1)).toEqual({
      status: NodeStatus.Running,
      path: [1, 0, 1],
    });
    expect(setup.interpreter.tick(setup.villager, 2).status).toBe(NodeStatus.Success);
    expect(setup.log).toEqual(["work@1", "find_food@1", "haul@1:1", "haul@2:0", "eat@2"]);
  });

  it("propagates a failing sub-tree to the parent sequence", () => {
    const setup = createSetup([
      { id: "bad_child", root: action("fail") },
      { id: "parent", root: sequence(action("run_tree", { treeId: "bad_child" }), action("eat")) },
    ]);
    setup.interpreter.setTree(setup.villager, "parent");
    expect(setup.interpreter.tick(setup.villager, 1).status).toBe(NodeStatus.Failure);
    expect(setup.log).toEqual([]);
  });
});
