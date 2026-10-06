import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EventBus } from "./EventBus";
import { TickPipeline, TickPipelineError, TickSlot, lastTickSlot } from "./TickPipeline";
import type { TickContext } from "./TickPipeline";
import { GameTime, ticksPerDay } from "../time/GameTime";

const canonicalSlots: [number, string][] = [
  [0, "Begin"],
  [1, "Commands"],
  [2, "Time"],
  [3, "Decay"],
  [4, "NeedsAndMood"],
  [5, "AiDecision"],
  [6, "TaskExecution"],
  [7, "JobBoards"],
  [8, "ProductionAndConstruction"],
  [9, "Zones"],
  [10, "StockpileTradeTreasury"],
  [11, "Diplomacy"],
  [12, "World"],
  [13, "HousingDay"],
  [14, "StewardDay"],
  [15, "TierDay"],
  [16, "IdentityMaintenance"],
  [17, "Removal"],
  [18, "Status"],
  [19, "LedgerRollover"],
  [20, "Drain"],
];

function createPipeline(): { pipeline: TickPipeline; time: GameTime; bus: EventBus } {
  const bus = new EventBus();
  const time = new GameTime(bus);
  return { pipeline: new TickPipeline({ time, bus }), time, bus };
}

describe("TickSlot", () => {
  it("matches the canonical table in docs/DECISIONS.md section 2", () => {
    const document = readFileSync("docs/DECISIONS.md", "utf8");
    const section = document.slice(document.indexOf("## 2. Canonical tick pipeline"));
    const rows = [...section.matchAll(/^\| (\d+) \| ([^|]+) \|/gm)].slice(0, 21);
    expect(rows.map((row) => Number(row[1]))).toEqual(canonicalSlots.map(([slot]) => slot));
    const enumEntries = Object.entries(TickSlot)
      .filter(([, value]) => typeof value === "number")
      .map(([name, value]) => [value, name]);
    expect(enumEntries).toEqual(canonicalSlots);
    expect(lastTickSlot).toBe(20);
  });
});

describe("TickPipeline", () => {
  it("runs systems in slot, then order, then registration order, with built-in slots between", () => {
    const { pipeline, time, bus } = createPipeline();
    const log: string[] = [];
    bus.subscribe("tick.begin", () => {
      log.push("event:tick.begin");
    });
    const add = (id: string, slot: TickSlot, order = 0): void => {
      pipeline.registerSystem({
        id,
        slot,
        order,
        run: () => {
          log.push(`${id}@tick${time.tickCount}`);
        },
      });
    };
    add("status", TickSlot.Status);
    add("commands", TickSlot.Commands);
    add("needs-b", TickSlot.NeedsAndMood, 5);
    add("needs-a", TickSlot.NeedsAndMood, -1);
    add("needs-c", TickSlot.NeedsAndMood, 5);
    add("begin", TickSlot.Begin);
    add("time-after", TickSlot.Time);
    add("drain", TickSlot.Drain);
    expect(pipeline.getSystemOrder().map((entry) => entry.id)).toEqual([
      "begin",
      "commands",
      "time-after",
      "needs-a",
      "needs-b",
      "needs-c",
      "status",
      "drain",
    ]);
    expect(pipeline.tick()).toBe(true);
    expect(log).toEqual([
      "event:tick.begin",
      "begin@tick0",
      "commands@tick0",
      "time-after@tick1",
      "needs-a@tick1",
      "needs-b@tick1",
      "needs-c@tick1",
      "status@tick1",
      "drain@tick1",
    ]);
  });

  // @covers 010:SC-001
  it("flushes tick.begin before any system and drains the bus last", () => {
    const { pipeline, bus } = createPipeline();
    const log: string[] = [];
    bus.subscribe("tick.begin", (payload) => {
      log.push(`begin:${JSON.stringify(payload)}`);
    });
    bus.subscribe("test.late", () => {
      log.push("late-delivered");
    });
    pipeline.registerSystem({
      id: "emitter",
      slot: TickSlot.Zones,
      order: 0,
      run: () => {
        bus.emit("test.late", {});
        log.push("emitted");
      },
    });
    pipeline.registerSystem({
      id: "after",
      slot: TickSlot.Status,
      order: 0,
      run: () => {
        log.push("status");
      },
    });
    pipeline.tick();
    expect(log).toEqual(['begin:{"tick":1}', "emitted", "status", "late-delivered"]);
    expect(bus.getQueue()).toEqual([]);
  });

  it("passes the tick and tick of day to systems", () => {
    const { pipeline, time } = createPipeline();
    const seen: TickContext[] = [];
    pipeline.registerSystem({
      id: "probe",
      slot: TickSlot.Commands,
      order: 0,
      run: (context) => {
        seen.push(context);
      },
    });
    pipeline.registerSystem({
      id: "probe-late",
      slot: TickSlot.Removal,
      order: 0,
      run: (context) => {
        seen.push(context);
      },
    });
    time.restore({ tickCount: ticksPerDay - 1, paused: false, speed: 1000, tickIntervalMs: 6250 });
    pipeline.tick();
    expect(seen).toEqual([
      { tick: ticksPerDay, tickOfDay: 0 },
      { tick: ticksPerDay, tickOfDay: 0 },
    ]);
  });

  it("does nothing while paused and resumes with exactly one tick", () => {
    const { pipeline, time, bus } = createPipeline();
    let runs = 0;
    pipeline.registerSystem({
      id: "counter",
      slot: TickSlot.Decay,
      order: 0,
      run: () => {
        runs += 1;
      },
    });
    time.pause();
    bus.processQueue();
    expect(pipeline.tick()).toBe(false);
    expect(runs).toBe(0);
    expect(time.tickCount).toBe(0);
    expect(bus.getQueue()).toEqual([]);
    time.resume();
    expect(pipeline.tick()).toBe(true);
    expect(time.tickCount).toBe(1);
    expect(runs).toBe(1);
  });

  it("rejects invalid and duplicate registrations", () => {
    const { pipeline } = createPipeline();
    const run = (): void => undefined;
    pipeline.registerSystem({ id: "one", slot: TickSlot.World, order: 0, run });
    expect(() =>
      pipeline.registerSystem({ id: "one", slot: TickSlot.Zones, order: 0, run }),
    ).toThrow(TickPipelineError);
    expect(() => pipeline.registerSystem({ id: "", slot: TickSlot.Zones, order: 0, run })).toThrow(
      TickPipelineError,
    );
    expect(() =>
      pipeline.registerSystem({ id: "bad-slot", slot: 21 as TickSlot, order: 0, run }),
    ).toThrow(TickPipelineError);
    expect(() =>
      pipeline.registerSystem({ id: "bad-order", slot: TickSlot.Zones, order: 1.5, run }),
    ).toThrow(TickPipelineError);
  });

  it("unregisters systems", () => {
    const { pipeline } = createPipeline();
    pipeline.registerSystem({ id: "temp", slot: TickSlot.World, order: 0, run: () => undefined });
    expect(pipeline.unregisterSystem("temp")).toBe(true);
    expect(pipeline.unregisterSystem("temp")).toBe(false);
    expect(pipeline.getSystemOrder()).toEqual([]);
  });

  it("runTicks stops when paused", () => {
    const { pipeline, time } = createPipeline();
    pipeline.registerSystem({
      id: "pauser",
      slot: TickSlot.Decay,
      order: 0,
      run: () => {
        if (time.tickCount === 3) {
          time.pause();
        }
      },
    });
    expect(pipeline.runTicks(10)).toBe(3);
    expect(time.tickCount).toBe(3);
  });

  it("1000 ticks land on the expected day and hour, and two pipelines stay identical", () => {
    const build = (): {
      pipeline: TickPipeline;
      time: GameTime;
      bus: EventBus;
      trace: number[];
    } => {
      const made = createPipeline();
      const trace: number[] = [];
      made.pipeline.registerSystem({
        id: "trace",
        slot: TickSlot.Status,
        order: 0,
        run: (context) => {
          trace.push(context.tick * 31 + context.tickOfDay);
        },
      });
      return { ...made, trace };
    };
    const left = build();
    const right = build();
    expect(left.pipeline.runTicks(1000)).toBe(1000);
    right.pipeline.runTicks(1000);
    expect(left.time.tickCount).toBe(1000);
    expect(left.time.toDay()).toBe(3);
    expect(left.time.toGameHours()).toBe(83);
    expect(JSON.stringify(left.time.serialize())).toBe(JSON.stringify(right.time.serialize()));
    expect(left.trace).toEqual(right.trace);
    expect(left.bus.serialize()).toEqual(right.bus.serialize());
  });
});
