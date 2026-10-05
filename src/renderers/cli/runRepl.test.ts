import { describe, expect, it } from "vitest";
import { GameSession } from "../../game/api/GameSession";
import { executeReplLine, replPrompt, runRepl } from "./runRepl";
import { createVerbRegistry } from "./verbs/verbRegistry";
import type { VerbContext } from "./verbs/Verb";

function createContext(): { context: VerbContext; disk: Map<string, string> } {
  const disk = new Map<string, string>();
  const context: VerbContext = {
    session: new GameSession(undefined, { entropy: () => 99 }),
    files: {
      readText: (path) => {
        const text = disk.get(path);
        if (text === undefined) {
          throw new Error(`no such file ${path}`);
        }
        return text;
      },
      writeText: (path, text) => {
        disk.set(path, text);
      },
    },
    verbs: createVerbRegistry(),
  };
  return { context, disk };
}

function run(context: VerbContext, line: string): string {
  const output = executeReplLine(context, line);
  if (output === null) {
    throw new Error("expected output");
  }
  return output.text;
}

async function* linesOf(...lines: string[]): AsyncGenerator<string> {
  await Promise.resolve();
  yield* lines;
}

describe("executeReplLine", () => {
  it("ignores blank lines and comments", () => {
    const { context } = createContext();
    expect(executeReplLine(context, "   ")).toBeNull();
    expect(executeReplLine(context, "# note")).toBeNull();
  });

  it("reports unknown verbs", () => {
    const { context } = createContext();
    expect(executeReplLine(context, "dance")).toEqual({
      ok: false,
      text: 'error: unknown command "dance"; try `help`',
    });
  });

  it("starts a game and shows status, map and entities", () => {
    const { context } = createContext();
    expect(run(context, "new 5 steady small")).toContain('"seed":5');
    expect(run(context, "status")).toContain("seed 5  difficulty steady");
    expect(run(context, "map").split("\n")[0]).toBe("map 1 (voronoi, 600 cells, 72x36 characters)");
    expect(run(context, "entities")).toContain("government_faction");
    expect(run(context, "inspect 1")).toContain("#1 government_faction");
    expect(run(context, "inspect 99")).toBe("no entity #99");
    expect(run(context, "events 2")).toContain("of");
    expect(run(context, "entities government_faction 5")).toContain("#1 government_faction");
  });

  it("uses the injected entropy for a seedless new", () => {
    const { context } = createContext();
    expect(run(context, "new")).toContain('"seed":99');
  });

  it("steps, pauses, resumes and changes speed", () => {
    const { context } = createContext();
    run(context, "new 1");
    expect(run(context, "step 5")).toContain("tick 5");
    expect(run(context, "pause")).toContain("paused");
    expect(run(context, "step 3")).toContain("paused: no tick ran");
    expect(run(context, "resume")).toContain("running");
  });

  it("run-until stops when the condition holds", () => {
    const { context } = createContext();
    run(context, "new 1");
    expect(run(context, "run-until time.tick gte 30")).toContain(
      "satisfied: ran 30 ticks, now tick 30",
    );
    expect(run(context, "run-until time.tick gte 99999 5")).toContain("max-ticks: ran 5 ticks");
    expect(run(context, "run-until time.tick wibble 1")).toContain("usage");
    expect(run(context, "run-until time.tick gte 1 x")).toContain("maxTicks");
  });

  it("shows and sets the speed", () => {
    const { context } = createContext();
    run(context, "new 1");
    expect(run(context, "speed")).toBe("speed 1000");
    expect(run(context, "speed double")).toContain("speed 2000");
    expect(run(context, "speed 500")).toContain("speed 500");
    expect(run(context, "speed warp")).toContain('unknown speed "warp"');
    expect(run(context, "speed 7")).toContain("error:");
  });

  it("saves and loads through the file access", () => {
    const { context, disk } = createContext();
    run(context, "new 4");
    run(context, "step 10");
    expect(run(context, "save game.json")).toContain("saved");
    expect(disk.get("game.json")).toContain("tick");
    run(context, "step 10");
    expect(run(context, "load game.json")).toContain("loaded game.json, tick 10");
    expect(run(context, "load missing.json")).toContain("no such file");
    expect(run(context, "save")).toContain("usage");
    expect(run(context, "load")).toContain("usage");
  });

  it("validates arguments", () => {
    const { context } = createContext();
    expect(run(context, "new x")).toContain("seed must be");
    expect(run(context, "new 1 steady huge")).toContain("mapSize must be");
    expect(run(context, "new 1 nightmare")).toContain("invalid-options");
    expect(run(context, "step x")).toContain("positive integer");
    expect(run(context, "step")).toContain("no-game");
    expect(run(context, "map")).toContain("there is no map");
    run(context, "new 1 steady 0");
    expect(run(context, "map 7")).toContain("does not exist");
    expect(run(context, "map x")).toContain("bad map id");
    expect(run(context, "inspect")).toContain("usage");
    expect(run(context, "events x")).toContain("non-negative");
  });

  it("describes verbs", () => {
    const { context } = createContext();
    expect(run(context, "help")).toContain("run-until <path> <op> <value> [maxTicks]");
    expect(run(context, "help step")).toContain("step [n]");
    expect(run(context, "help nope")).toContain("unknown command");
  });

  it("turns a throwing verb into an error line", () => {
    const { context } = createContext();
    const broken = {
      ...context,
      verbs: [
        {
          name: "boom",
          usage: "boom",
          summary: "x",
          run: (): never => {
            throw new Error("kaput");
          },
        },
      ],
    };
    expect(run(broken, "boom")).toBe("error: kaput");
  });
});

describe("runRepl", () => {
  it("prompts, runs lines and stops at quit", async () => {
    const { context } = createContext();
    const written: string[] = [];
    await runRepl(
      context,
      linesOf("new 1", "", "quit", "status"),
      (text) => written.push(text),
      replPrompt,
    );
    const output = written.join("");
    expect(output.startsWith(replPrompt)).toBe(true);
    expect(output).toContain("bye");
    expect(output).not.toContain("difficulty steady  tier");
  });

  it("ends cleanly at EOF and prints no prompt when piped", async () => {
    const { context } = createContext();
    const written: string[] = [];
    await runRepl(context, linesOf("new 1", "status"), (text) => written.push(text), "");
    expect(written.join("")).toContain("seed 1");
    expect(written.join("")).not.toContain(replPrompt);
  });
});
