import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { CommandMode } from "../engine/engineSystemTypes";
import { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { CommandKind } from "./Command";
import { CommandQueue } from "./CommandQueue";
import { EventLog } from "./EventLog";
import { createKernelSystem, kernelSystemId } from "./kernelSystem";
import type { KernelHost } from "./kernelSystem";

function createHost(): { host: KernelHost; calls: string[] } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  const calls: string[] = [];
  const host: KernelHost = {
    engine,
    queue: new CommandQueue(),
    eventLog: new EventLog(),
    advance: (ticks) => {
      calls.push(`advance:${ticks}`);
      return ticks;
    },
    applyQueued: (tick) => {
      calls.push(`apply:${tick}`);
    },
    setLoggedCommand: (command) => {
      calls.push(`log:${command.kind}`);
    },
  };
  return { host, calls };
}

describe("createKernelSystem", () => {
  it("defines the queue slot, the save section, every kernel command and the kernel queries", () => {
    const { host, calls } = createHost();
    const definition = createKernelSystem(host);
    expect(definition.id).toBe(kernelSystemId);
    expect(definition.slot).toBe(TickSlot.Commands);
    expect(definition.saveSection?.key).toBe("commandQueue");
    expect(Object.keys(definition.commandHandlers ?? {}).sort()).toEqual(
      Object.values(CommandKind).sort(),
    );
    for (const registration of Object.values(definition.commandHandlers ?? {})) {
      expect(registration.mode).toBe(CommandMode.Immediate);
    }
    expect(Object.keys(definition.queries ?? {})).toHaveLength(12);
    definition.run?.({ tick: 4, tickOfDay: 4 });
    expect(calls).toEqual(["apply:4"]);
  });

  it("only NewGame and LoadGame work without a game", () => {
    const { host } = createHost();
    const handlers = createKernelSystem(host).commandHandlers ?? {};
    expect(handlers[CommandKind.NewGame]?.requiresGame).toBe(false);
    expect(handlers[CommandKind.LoadGame]?.requiresGame).toBe(false);
    expect(handlers[CommandKind.Step]?.requiresGame).toBeUndefined();
  });

  it("NewGame logs the seed it used and Step goes through the host", () => {
    const { host, calls } = createHost();
    host.engine.registerSystem(createKernelSystem(host));
    const newGame = host.engine.getCommandHandler(CommandKind.NewGame);
    expect(newGame?.handler({ options: { seed: 9 } }, host.engine)).toMatchObject({ seed: 9 });
    expect(calls).toEqual(["log:new-game"]);
    const step = host.engine.getCommandHandler(CommandKind.Step);
    expect(step?.handler({ ticks: 3 }, host.engine)).toEqual({
      ticksRun: 3,
      tick: 0,
      paused: false,
    });
  });
});
