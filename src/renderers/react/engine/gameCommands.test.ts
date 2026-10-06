import { describe, expect, it } from "vitest";
import type { CommandResult } from "../../../game/api/CommandResult";
import { createGameCommands, speedOptions } from "./gameCommands";
import type { GameCommand, GameCommands } from "./gameCommands";

function recorder(): { sent: GameCommand[]; steps: number[]; commands: GameCommands } {
  const sent: GameCommand[] = [];
  const steps: number[] = [];
  const result: CommandResult = {
    ok: true,
    commandId: 1,
    queued: false,
    data: null,
    events: [],
    droppedEvents: 0,
  };
  const commands = createGameCommands({
    dispatch: (command) => {
      sent.push(command);
      return result;
    },
    step: (ticks) => {
      steps.push(ticks);
      return result;
    },
  });
  return { sent, steps, commands };
}

describe("createGameCommands", () => {
  it("maps clock controls to the kernel commands", () => {
    const { sent, steps, commands } = recorder();
    commands.pause();
    commands.resume();
    commands.setSpeed(2000);
    commands.step(5);
    expect(sent).toEqual([
      { kind: "pause" },
      { kind: "resume" },
      { kind: "set-speed", speed: 2000 },
    ]);
    expect(steps).toEqual([5]);
  });

  it("maps build definitions like the CLI build verb", () => {
    const { sent, commands } = recorder();
    commands.placeBuild("wall", 1, [3, 4]);
    commands.placeBuild("door", 1, [5]);
    commands.placeBuild("oven", 1, [6]);
    expect(sent).toEqual([
      { kind: "PlaceWall", mapId: 1, cells: [3, 4] },
      { kind: "PlaceDoor", mapId: 1, cell: 5 },
      { kind: "PlaceFurniture", furnitureId: "oven", mapId: 1, cell: 6 },
    ]);
  });

  it("starts a game and passes any other command through", () => {
    const { sent, commands } = recorder();
    commands.newGame({ seed: 9, difficulty: "harsh", mapSize: 1, startingTier: "hamlet" });
    commands.send({ kind: "PauseJobBoard", boardId: 2 });
    expect(sent[0]).toEqual({
      kind: "new-game",
      options: { seed: 9, difficulty: "harsh", mapSize: 1, startingTier: "hamlet" },
    });
    expect(sent[1]).toEqual({ kind: "PauseJobBoard", boardId: 2 });
  });

  it("offers the five engine speeds", () => {
    expect(speedOptions.map((option) => option.value)).toEqual([250, 500, 1000, 2000, 4000]);
  });
});
