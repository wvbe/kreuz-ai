import { describe, expect, it } from "vitest";
import { z } from "zod";
import { NodeStatus } from "../behavior/behaviorTypes";
import { bundledContentFiles, loadContent, loadContentPack } from "../content/ContentLoader";
import { ContentValidationError } from "../content/ContentValidationError";
import { ContentFile, SettlementTier } from "../content/contentTypes";
import { defineComponent } from "../ecs/ComponentRegistry";
import { RelationshipDirection } from "../ecs/RelationshipRegistry";
import { getTotal } from "../inventory/inventoryQueries";
import { storeUpTo } from "../inventory/inventoryOperations";
import { MapSize } from "../map/mapSize";
import { GridType } from "../map/mapTypes";
import { Difficulty } from "../save/initOptions";
import { InvalidSaveFormatError } from "../save/InvalidSaveFormatError";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import { continueStep, doneStep } from "../task/stepResults";
import { InitMode } from "./engineSystemTypes";
import type { SystemInitContext } from "./engineSystemTypes";
import { GameEngine } from "./GameEngine";
import type { GameEngineDeps } from "./GameEngine";
import { GameEngineError, GameEngineErrorKind } from "./GameEngineError";
import { InvalidOptionsError } from "./InvalidOptionsError";
import { SystemRegistryError, SystemRegistryErrorKind } from "./SystemRegistryError";
import { TickSlot } from "./TickPipeline";
import type { JsonValue } from "./EventBus";

function createEngine(deps: GameEngineDeps = { entropy: () => 777 }): GameEngine {
  return new GameEngine(loadContent(), deps);
}

function queuedNames(engine: GameEngine): string[] {
  return engine.bus.getQueue().map((event) => event.name);
}

describe("GameEngine newGame", () => {
  it("creates an idle game at tick 0 with only the government faction", () => {
    const engine = createEngine();
    expect(engine.hasGame).toBe(false);
    const result = engine.newGame();
    expect(engine.hasGame).toBe(true);
    expect(engine.getTime().tick).toBe(0);
    expect(engine.getEntities().map((entity) => entity.prototype)).toEqual(["government_faction"]);
    expect(engine.getEntity(1)?.prototype).toBe("government_faction");
    expect(engine.maps.size).toBe(0);
    expect(result).toEqual({
      options: { seed: 777, difficulty: Difficulty.Steady, startingTier: "hamlet", mapSize: null },
      ignoredFields: [],
    });
    expect(queuedNames(engine)).toEqual(["entity.spawned", "game.started"]);
    expect(engine.bus.getQueue()[1]?.payload).toEqual({
      seed: 777,
      difficulty: "steady",
      startingTier: "hamlet",
    });
  });

  it("stores explicit options and passes the seed to the PRNG without touching entropy", () => {
    let draws = 0;
    const engine = createEngine({
      entropy: () => {
        draws += 1;
        return 1;
      },
    });
    engine.newGame({
      difficulty: Difficulty.Harsh,
      seed: 12345,
      startingTier: SettlementTier.Village,
    });
    expect(draws).toBe(0);
    expect(engine.prng.seed).toBe(12345);
    expect(engine.getState().initOptions).toEqual({
      seed: 12345,
      difficulty: Difficulty.Harsh,
      startingTier: "village",
      mapSize: null,
    });
  });

  it("draws the seed from the entropy source exactly once and records it in the save", () => {
    let draws = 0;
    const engine = createEngine({
      entropy: () => {
        draws += 1;
        return 4242;
      },
    });
    engine.newGame();
    engine.runTicks(5);
    engine.saveGame();
    expect(draws).toBe(1);
    expect(engine.prng.seed).toBe(4242);
    expect(
      (JSON.parse(engine.saveGame()) as { initOptions: { seed: number } }).initOptions.seed,
    ).toBe(4242);
  });

  it("rejects a missing seed when the engine has no entropy source", () => {
    const engine = createEngine({});
    expect(() => engine.newGame()).toThrow(GameEngineError);
    expect(engine.hasGame).toBe(false);
    expect(() => engine.newGame({ seed: 1 })).not.toThrow();
  });

  it("rejects invalid options with the exact message and keeps the running game", () => {
    const engine = createEngine();
    engine.newGame({ seed: 5 });
    engine.runTicks(3);
    const before = engine.getStateHash();
    const bad = JSON.parse('{"difficulty":"super-hard"}') as { difficulty: Difficulty };
    expect(() => engine.newGame(bad)).toThrow(InvalidOptionsError);
    expect(() => engine.newGame(bad)).toThrow(
      "Invalid difficulty: 'super-hard'. Valid values: peaceful, steady, harsh.",
    );
    expect(engine.getStateHash()).toBe(before);
    expect(engine.getTime().tick).toBe(3);
  });

  it("reports ignored option names", () => {
    const engine = createEngine();
    const typo = JSON.parse('{"seed":9,"dificulty":"harsh"}') as { seed: number };
    expect(engine.newGame(typo).ignoredFields).toEqual(["dificulty"]);
  });

  it("fully replaces a previous game", () => {
    const engine = createEngine();
    engine.newGame({ seed: 1, mapSize: MapSize.Small });
    engine.runTicks(10);
    engine.store.spawn("peasant");
    engine.newGame({ seed: 2 });
    expect(engine.getTime().tick).toBe(0);
    expect(engine.getEntities().map((entity) => entity.id)).toEqual([1]);
    expect(engine.maps.size).toBe(0);
    expect(engine.prng.seed).toBe(2);
    expect(queuedNames(engine)).toEqual(["entity.spawned", "game.started"]);
  });

  it("creates the starting map when mapSize is given, independent of difficulty", () => {
    const small = createEngine();
    small.newGame({ seed: 42, mapSize: MapSize.Small, difficulty: Difficulty.Peaceful });
    const other = createEngine();
    other.newGame({ seed: 42, mapSize: MapSize.Small, difficulty: Difficulty.Harsh });
    expect(small.maps.size).toBe(1);
    expect(small.getMap(1)?.params.cellCount).toBe(600);
    expect(small.getMap(1)).toEqual(other.getMap(1));
    expect(small.getEntities()).toEqual(other.getEntities());
    expect(small.getMap(2)).toBeUndefined();
  });

  it("requires the government faction prototype (ContentValidationError, nothing changes)", () => {
    const files = {
      ...bundledContentFiles,
      [ContentFile.EnginePrototypes]: [
        { id: "wall", components: { Position: {} } },
        { id: "job_board", components: { Position: {} } },
      ],
    };
    const engine = new GameEngine(loadContentPack(files), { entropy: () => 1 });
    expect(() => engine.newGame()).toThrow(ContentValidationError);
    expect(engine.hasGame).toBe(false);
  });

  it("turns a prototype with an unregistered component into a ContentValidationError", () => {
    const files = {
      ...bundledContentFiles,
      [ContentFile.EnginePrototypes]: [{ id: "government_faction", components: { Mystery: {} } }],
    };
    const engine = new GameEngine(loadContentPack(files), { entropy: () => 1 });
    expect(() => engine.newGame()).toThrow(ContentValidationError);
  });

  it("keeps two engines isolated", () => {
    const first = createEngine();
    const second = createEngine();
    first.newGame({ seed: 1 });
    second.newGame({ seed: 1 });
    first.runTicks(20);
    first.store.spawn("peasant");
    expect(second.getTime().tick).toBe(0);
    expect(second.getEntities()).toHaveLength(1);
    expect(first.counters).not.toBe(second.counters);
    expect(first.bus).not.toBe(second.bus);
    second.runTicks(20);
    first.store.requestDelete(2);
    first.runTicks(1);
    second.runTicks(1);
    expect(second.getTime().tick).toBe(21);
    expect(first.getEntities()).toHaveLength(1);
  });
});

describe("GameEngine loadGame and saveGame", () => {
  function runningEngine(): GameEngine {
    const engine = createEngine();
    engine.newGame({ seed: 7, mapSize: MapSize.Small });
    engine.runTicks(12);
    return engine;
  }

  it("round-trips a save given as text or as an object", () => {
    const source = runningEngine();
    const text = source.saveGame({ timestamp: "2026-10-05T12:00:00.000Z" });
    const fromText = createEngine();
    fromText.loadGame(text);
    expect(fromText.saveGame({ timestamp: "2026-10-05T12:00:00.000Z" })).toBe(text);
    const fromObject = createEngine();
    fromObject.loadGame(JSON.parse(text) as JsonValue);
    expect(fromObject.getStateHash()).toBe(source.getStateHash());
    expect(fromObject.save()).toBe(source.save());
    expect(fromObject.getTime().tick).toBe(12);
    expect(fromObject.hasGame).toBe(true);
  });

  it("emits game.loaded and drains the queue", () => {
    const source = runningEngine();
    const engine = createEngine();
    const seen: JsonValue[] = [];
    engine.bus.subscribe("game.loaded", (payload) => {
      seen.push(payload);
    });
    engine.loadGame(source.saveGame());
    expect(seen).toEqual([{ tick: 12 }]);
    expect(engine.bus.getQueue()).toEqual([]);
  });

  it("continues identically after save and load", () => {
    const uninterrupted = runningEngine();
    const resumed = runningEngine();
    const loaded = createEngine();
    loaded.loadGame(resumed.saveGame());
    uninterrupted.runTicks(300);
    loaded.runTicks(300);
    expect(loaded.getStateHash()).toBe(uninterrupted.getStateHash());
  });

  it("leaves the game untouched when a load fails", () => {
    const engine = runningEngine();
    const before = engine.saveGame();
    for (const bad of ["", "not json", "{}", '{"version":99}']) {
      expect(() => engine.loadGame(bad)).toThrow();
    }
    expect(() => engine.loadGame("not json")).toThrow(InvalidSaveFormatError);
    expect(engine.saveGame()).toBe(before);
    expect(engine.getTime().tick).toBe(12);
  });

  it("works on an engine that has no game yet and keeps it empty on failure", () => {
    const engine = createEngine();
    expect(() => engine.loadGame("garbage")).toThrow(InvalidSaveFormatError);
    expect(engine.hasGame).toBe(false);
  });

  it("refuses to tick or save without a game", () => {
    const engine = createEngine();
    for (const action of [() => engine.tick(), () => engine.runTicks(1), () => engine.saveGame()]) {
      try {
        action();
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(GameEngineError);
        expect((error as GameEngineError).kind).toBe(GameEngineErrorKind.NoGame);
      }
    }
  });

  it("loads a save into an engine whose game is further along", () => {
    const early = createEngine();
    early.newGame({ seed: 3 });
    early.runTicks(2);
    const later = createEngine();
    later.newGame({ seed: 3 });
    later.runTicks(40);
    later.loadGame(early.saveGame());
    expect(later.getTime().tick).toBe(2);
    expect(later.getStateHash()).toBe(early.getStateHash());
  });
});

describe("GameEngine query facade", () => {
  it("returns copies that do not write through", () => {
    const engine = createEngine();
    engine.newGame({ seed: 1 });
    const entity = engine.store.spawn("peasant");
    const copy = engine.getEntity(entity.id);
    expect(copy).toBeDefined();
    if (!copy) {
      return;
    }
    copy.components["Inventory"] = { slotCount: 99 };
    const components = engine.getComponents(entity.id);
    expect(components?.["Inventory"]?.["slotCount"]).not.toBe(99);
    if (components) {
      components["TaskQueue"] = { tasks: [] };
    }
    expect(engine.getEntities()).toHaveLength(2);
    expect(engine.getEntity(999)).toBeUndefined();
    expect(engine.getComponents(999)).toBeUndefined();
    expect(engine.getMap(1)).toBeUndefined();
  });

  it("hides entities that are flagged for deletion", () => {
    const engine = createEngine();
    engine.newGame({ seed: 1 });
    const entity = engine.store.spawn("peasant");
    engine.store.requestDelete(entity.id);
    expect(engine.getEntity(entity.id)).toBeUndefined();
  });

  it("summarizes the state and the clock", () => {
    const engine = createEngine();
    expect(engine.getState().hasGame).toBe(false);
    engine.newGame({ seed: 1, mapSize: MapSize.Small });
    engine.runTicks(300);
    const state = engine.getState();
    // settlement kit (9) plus three NPC factions, their six members and two envoys under way
    expect(state.entityCount).toBe(20);
    expect(state.mapCount).toBe(1);
    expect(state.time).toEqual({
      tick: 300,
      paused: false,
      speed: 1000,
      tickIntervalMs: 6250,
      day: 1,
      tickOfDay: 12,
      hourOfDay: 1,
    });
  });

  it("answers queries quickly with 1000 entities", () => {
    const engine = createEngine();
    engine.newGame({ seed: 1 });
    for (let index = 0; index < 1000; index += 1) {
      engine.store.spawn("peasant");
    }
    expect(engine.getEntities()).toHaveLength(1001);
    expect(engine.getEntity(500)?.id).toBe(500);
  });
});

describe("GameEngine registerSystem", () => {
  const counterComponent = defineComponent(
    "Counter",
    z.object({ value: z.number().int() }).strict(),
    () => ({ value: 0 }),
  );
  const ledgerSchema = z.object({ total: z.number().int() }).strict();

  it("registers tick function, init, save section, component and handler in one call", () => {
    const engine = createEngine();
    const ledger = { total: 0 };
    const initModes: InitMode[] = [];
    engine.registerSystem({
      id: "demo.counter",
      slot: TickSlot.World,
      order: 5,
      run: () => {
        ledger.total += 1;
      },
      init: ({ mode }) => {
        initModes.push(mode);
      },
      components: [counterComponent],
      saveSection: {
        key: "demoLedger",
        location: SaveSectionLocation.Systems,
        schema: ledgerSchema,
        serialize: () => ({ total: ledger.total }),
        restore: (saved) => {
          ledger.total = ledgerSchema.parse(saved).total;
        },
      },
      commandHandlers: {
        "demo.ping": { schema: z.object({}).strict(), handler: () => "pong" },
      },
      queries: { "demo.total": { schema: z.undefined(), run: () => ledger.total } },
    });
    expect(engine.components.has("Counter")).toBe(true);
    expect(engine.getCommandHandler("demo.ping")?.handler(null, engine)).toBe("pong");
    expect(engine.getQuery("demo.total")?.run(null, engine)).toBe(0);
    expect(engine.getQuery("demo.none")).toBeUndefined();
    expect(engine.queryNames()).toEqual([
      "agreements",
      "build-menu",
      "construction-queue",
      "crops",
      "demo.total",
      "directives",
      "envoys",
      "explain",
      "faction-of",
      "factions",
      "factions-diplomacy",
      "find-path",
      "find-route",
      "flow",
      "flow-of",
      "identity-of",
      "idle-blocked",
      "job",
      "job-boards",
      "jobs-on",
      "members-of",
      "needs-of",
      "order",
      "pending-updates",
      "production-orders",
      "proposals",
      "reachable",
      "recipes-for",
      "reservations",
      "site",
      "skills-of",
      "stock",
      "stockpiles",
      "town-criers",
      "trade-ledger",
      "trade-offers",
      "trade-orders",
      "trade-quote",
      "traders",
      "traits-of",
      "treasury",
      "validate-placement",
      "workstations",
      "zone",
      "zone-at",
      "zone-merge-offers",
      "zones",
    ]);
    expect(engine.getCommandHandler("demo.none")).toBeUndefined();
    expect(engine.commandKinds()).toEqual([
      "AcceptTradeCounter",
      "AddZoneTiles",
      "AppointTownCrier",
      "CancelConstruction",
      "CancelConstructionJob",
      "CancelCraft",
      "CancelDiplomaticDirective",
      "CancelPendingBoardUpdate",
      "CancelProductionOrder",
      "CancelTradeOrder",
      "ConfirmZoneMerge",
      "CreateProductionOrder",
      "DeleteZone",
      "DesignateZone",
      "DismissTownCrier",
      "IssueDiplomaticAct",
      "ModifyPosting",
      "MoveConstructionJobToFront",
      "PlaceDoor",
      "PlaceFurniture",
      "PlaceWall",
      "PostCustomJob",
      "PostJob",
      "ProposeTrade",
      "QueueConstruction",
      "QueueDeconstruction",
      "QueueWalls",
      "RemovePosting",
      "RemoveZoneTiles",
      "RespondToProposal",
      "SetConstructionJobPaused",
      "SetConstructionPriority",
      "SetFactionLeader",
      "SetJobBoardPaused",
      "SetPriceMultiplier",
      "SetProductionOrderPaused",
      "SetProductionOrderPriority",
      "SetSellsItems",
      "SetStockpilePriority",
      "SetStorageMaterialFilter",
      "SetZoneMaterialFilter",
      "TradeBuy",
      "TradeSell",
      "WithdrawTradeOffer",
      "demo.ping",
    ]);
    engine.newGame({ seed: 1 });
    engine.runTicks(4);
    expect(ledger.total).toBe(4);
    const text = engine.saveGame();
    expect(JSON.parse(text).systems.demoLedger).toEqual({ total: 4 });
    engine.runTicks(3);
    engine.loadGame(text);
    expect(ledger.total).toBe(4);
    engine.newGame({ seed: 2 });
    expect(ledger.total).toBe(0);
    expect(initModes).toEqual([InitMode.NewGame, InitMode.LoadGame, InitMode.NewGame]);
    expect(engine.pipeline.getSystemOrder().some((entry) => entry.id === "demo.counter")).toBe(
      true,
    );
  });

  it("runs init hooks in dependency order, before newGame returns", () => {
    const engine = createEngine();
    const order: string[] = [];
    const hook = (name: string) => (context: SystemInitContext) => {
      order.push(`${name}:${context.engine.getEntities().length}`);
    };
    engine.registerSystem({ id: "late.one", dependencies: ["early.two"], init: hook("late") });
    engine.registerSystem({ id: "early.two", init: hook("early") });
    engine.newGame({ seed: 1 });
    expect(order).toEqual(["early:1", "late:1"]);
  });

  it("rejects a missing dependency and a cycle before the game changes", () => {
    const engine = createEngine();
    engine.newGame({ seed: 1 });
    engine.runTicks(2);
    engine.registerSystem({ id: "needs.ghost", dependencies: ["ghost.system"] });
    expect(() => engine.newGame({ seed: 9 })).toThrow(/depends on "ghost.system"/);
    expect(() => engine.loadGame(engine.saveGame())).toThrow(SystemRegistryError);
    expect(engine.getTime().tick).toBe(2);
    expect(engine.prng.seed).toBe(1);

    const cyclic = createEngine();
    cyclic.registerSystem({ id: "cycle.a", dependencies: ["cycle.b"] });
    cyclic.registerSystem({ id: "cycle.b", dependencies: ["cycle.a"] });
    expect(() => cyclic.newGame({ seed: 1 })).toThrow(/cycle/);
  });

  it("rejects invalid definitions without side effects", () => {
    const engine = createEngine();
    const kinds: SystemRegistryErrorKind[] = [];
    for (const definition of [
      { id: "bad.run", run: () => undefined },
      { id: "bad.slot", slot: TickSlot.World },
      { id: "Bad Id" },
      { id: "task.execution" },
    ]) {
      try {
        engine.registerSystem(definition);
      } catch (error) {
        kinds.push((error as SystemRegistryError).kind);
      }
    }
    expect(kinds).toEqual([
      SystemRegistryErrorKind.InvalidDefinition,
      SystemRegistryErrorKind.InvalidDefinition,
      SystemRegistryErrorKind.InvalidDefinition,
      SystemRegistryErrorKind.DuplicateSystem,
    ]);
  });

  it("rejects a duplicate command handler and a duplicate pipeline or section key", () => {
    const engine = createEngine();
    const command = { schema: z.object({}).strict(), handler: () => null };
    const query = { schema: z.undefined(), run: () => null };
    engine.registerSystem({
      id: "one.system",
      commandHandlers: { "x.cmd": command },
      queries: { "x.query": query },
    });
    expect(() =>
      engine.registerSystem({ id: "two.system", commandHandlers: { "x.cmd": command } }),
    ).toThrow(GameEngineError);
    expect(() =>
      engine.registerSystem({ id: "four.system", queries: { "x.query": query } }),
    ).toThrow(GameEngineError);
    expect(engine.pipeline.getSystemOrder().some((entry) => entry.id === "two.system")).toBe(false);
    const section = {
      key: "dupKey",
      location: SaveSectionLocation.Systems,
      schema: z.number().int(),
      serialize: () => 1,
      restore: () => undefined,
    };
    engine.registerSystem({ id: "three.system", saveSection: section });
    expect(() =>
      engine.registerSystem({
        id: "four.system",
        slot: TickSlot.World,
        run: () => undefined,
        saveSection: section,
      }),
    ).toThrow();
    expect(engine.pipeline.getSystemOrder().some((entry) => entry.id === "four.system")).toBe(
      false,
    );
  });

  it("restores the previous game when an init hook throws during newGame", () => {
    const engine = createEngine();
    let explode = false;
    engine.registerSystem({
      id: "bomb.system",
      init: ({ mode }) => {
        if (explode && mode === InitMode.NewGame) {
          throw new Error("boom");
        }
      },
    });
    engine.newGame({ seed: 11 });
    engine.runTicks(6);
    const before = engine.saveGame();
    explode = true;
    expect(() => engine.newGame({ seed: 12 })).toThrow(/boom/);
    expect(engine.saveGame()).toBe(before);
    expect(engine.hasGame).toBe(true);
    const fresh = createEngine();
    fresh.registerSystem({
      id: "bomb.system",
      init: () => {
        throw new Error("always");
      },
    });
    try {
      fresh.newGame({ seed: 1 });
      expect.unreachable();
    } catch (error) {
      expect((error as GameEngineError).kind).toBe(GameEngineErrorKind.InitFailed);
    }
    expect(fresh.hasGame).toBe(false);
    expect(fresh.getEntities()).toEqual([]);
  });

  it("restores the previous game when an init hook throws during loadGame", () => {
    const source = createEngine();
    source.newGame({ seed: 4 });
    source.runTicks(9);
    const text = source.saveGame();
    const engine = createEngine();
    let explode = false;
    engine.registerSystem({
      id: "bomb.system",
      init: ({ mode }) => {
        if (explode && mode === InitMode.LoadGame && engine.getTime().tick === 9) {
          throw new Error("load boom");
        }
      },
    });
    engine.newGame({ seed: 5 });
    engine.runTicks(2);
    const before = engine.saveGame();
    explode = true;
    expect(() => engine.loadGame(text)).toThrow(/load boom/);
    expect(engine.saveGame()).toBe(before);
  });
});

describe("GameEngine built-in systems", () => {
  it("runs the removal slot: deletes entities, frees cells and clears references", () => {
    const engine = createEngine();
    engine.newGame({ seed: 1 });
    engine.maps.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grassland",
      size: MapSize.Small,
      seed: 1,
    });
    const placed = engine.store.spawn("peasant");
    engine.maps.placeEntity(placed.id, 1, 0);
    const unplaced = engine.store.spawn("peasant");
    const holder = engine.store.spawn("peasant");
    engine.components.register(
      defineComponent("Owner", z.object({ target: z.number().int().nullable() }).strict(), () => ({
        target: null,
      })),
    );
    engine.store.addComponent(holder.id, engine.components.require("Owner"), {
      target: placed.id,
    });
    engine.relationships.register({
      name: "owner",
      component: "Owner",
      field: "target",
      direction: RelationshipDirection.Forward,
      many: false,
    });
    engine.store.requestDelete(placed.id);
    engine.store.requestDelete(unplaced.id);
    const names: string[] = [];
    engine.bus.subscribe("entity.deleted", (payload) => {
      names.push(String((payload as { entityId: number }).entityId));
    });
    engine.tick();
    expect(names).toEqual([String(placed.id), String(unplaced.id)]);
    expect(engine.store.has(placed.id)).toBe(false);
    expect(engine.maps.queryCell(1, 0).occupants).toEqual([]);
    expect(engine.store.require(holder.id).components["Owner"]?.["target"]).toBeNull();
  });

  it("decays perishables at slot 3 scaled by difficulty", () => {
    const remaining = (difficulty: Difficulty): number => {
      const engine = createEngine();
      engine.newGame({ seed: 1, difficulty });
      const entity = engine.store.spawn("peasant");
      storeUpTo({ materials: engine.materials, actor: null, bus: engine.bus }, entity, "bread", 2);
      engine.runTicks(10);
      const slot = (
        engine.store.require(entity.id).components["Inventory"]?.["slots"] as {
          materialId: string;
          remainingMilli: number;
        }[]
      ).find((item) => item.materialId === "bread");
      return slot?.remainingMilli ?? 0;
    };
    const peaceful = remaining(Difficulty.Peaceful);
    const steady = remaining(Difficulty.Steady);
    const harsh = remaining(Difficulty.Harsh);
    expect(peaceful).toBeGreaterThan(steady);
    expect(steady).toBeGreaterThan(harsh);
    expect(steady).toBe(864 * 1000 - 10 * 1000);
  });

  it("expires perishables and keeps counts consistent", () => {
    const engine = createEngine();
    engine.newGame({ seed: 1, difficulty: Difficulty.Harsh });
    const entity = engine.store.spawn("peasant");
    storeUpTo({ materials: engine.materials, actor: null, bus: engine.bus }, entity, "bread", 2);
    engine.runTicks(700);
    expect(getTotal(engine.store.require(entity.id), "bread")).toBe(0);
  });

  it("executes tasks at slot 6", () => {
    const engine = createEngine();
    let steps = 0;
    engine.taskHandlers.register({
      type: "demo.walk",
      start: () => continueStep(),
      step: () => {
        steps += 1;
        return steps >= 3 ? doneStep() : continueStep();
      },
      cancel: () => undefined,
    });
    engine.newGame({ seed: 1 });
    const entity = engine.store.spawn("peasant", { AiState: { treeId: null } });
    engine.tasks.enqueue(entity.id, { type: "demo.walk" });
    engine.runTicks(6);
    expect(steps).toBe(3);
    expect(engine.tasks.getQueue(entity.id)?.tasks).toEqual([]);
  });

  it("collects event bus errors and keeps going", () => {
    const reports: string[] = [];
    const engine = createEngine({
      entropy: () => 1,
      errorSink: (report) => reports.push(report.topic),
    });
    engine.newGame({ seed: 1 });
    engine.bus.subscribe("demo.event", () => {
      throw new Error("subscriber failed");
    });
    engine.bus.emit("demo.event", null);
    engine.tick();
    expect(engine.errors).toHaveLength(1);
    expect(reports).toEqual(["demo.event"]);
    engine.newGame({ seed: 2 });
    expect(engine.errors).toEqual([]);
  });

  it("loads the content behavior trees because the AI registers their handlers", () => {
    const engine = createEngine();
    engine.newGame({ seed: 1 });
    expect(engine.warnings).toEqual([]);
    expect(engine.behaviorTrees.require("basic_needs").id).toBe("basic_needs");
    expect(engine.behaviorHandlers.hasCondition("any_need_below_critical")).toBe(true);
    expect(engine.behaviorHandlers.hasAction("satisfy_critical_need")).toBe(true);
    expect(engine.behaviorHandlers.hasAction("idle_wander")).toBe(true);
    const peasant = engine.store.spawn("peasant");
    engine.behavior.setTree(peasant.id, "basic_needs");
    expect(engine.behavior.tick(peasant.id, 1).status).toBe(NodeStatus.Success);
  });
});
