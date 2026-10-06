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

  it("lists the job boards and their postings (plan 3.1)", () => {
    const { context } = createContext();
    expect(run(context, "jobs")).toBe("no job boards");
    run(context, "new 42 steady small");
    expect(run(context, "jobs")).toMatch(
      /^board #2 user-managed at map 1 cell \d+ running: 0 open, 0 claimed\n {2}no postings$/,
    );
    run(context, "step 12");
    const lines = run(context, "jobs 2").split("\n");
    expect(lines[0]).toMatch(/^board #2 user-managed at map 1 cell \d+ running: \d+ open/);
    expect(lines.some((line) => /^ {2}#1 fell\.trees (open|claimed)/.test(line))).toBe(true);
    expect(run(context, "jobs 9")).toBe("board 9 does not exist");
    expect(run(context, "jobs x")).toBe("error: usage: jobs [boardId]");
  });

  it("designates, lists and inspects zones, and draws them on the map (plan 3.4)", () => {
    const { context } = createContext();
    expect(run(context, "zones")).toBe("no zones");
    run(context, "new 42 steady small");
    expect(run(context, "zones")).toBe("no zones");
    const chestCell = /#9 chest at cell (\d+)/.exec(run(context, "stock"))?.[1] ?? "0";
    expect(run(context, `zone designate stockpile 1 ${chestCell}`)).toContain(
      "queued DesignateZone",
    );
    run(context, "step 1");
    expect(run(context, "zones")).toMatch(/^#\d+ stockpile on map 1: active, 1 tiles$/);
    const zoneId = /^#(\d+)/.exec(run(context, "zones"))?.[1] ?? "0";
    const detail = run(context, `zone ${zoneId}`).split("\n");
    expect(detail[0]).toMatch(/^zone #\d+ stockpile on map 1: active, created tick 0$/);
    expect(detail).toContain(`  tiles (1): ${chestCell}`);
    expect(detail).toContain("  gaps: none");
    expect(run(context, "map")).toContain("zones: S stockpile");
    expect(run(context, "zones 1")).toMatch(/stockpile/);
    expect(run(context, `zone delete ${zoneId}`)).toContain("queued DeleteZone");
    run(context, "step 1");
    expect(run(context, "zones")).toBe("no zones");
    expect(run(context, "zone 9999")).toBe("zone 9999 does not exist");
  });

  it("explains zone verb mistakes", () => {
    const { context } = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "zones x")).toBe("error: usage: zones [mapId]");
    expect(run(context, "zone")).toMatch(/^error: usage: zone </);
    expect(run(context, "zone designate stockpile")).toMatch(/^error: usage: zone </);
    expect(run(context, "zone designate stockpile 1 x")).toMatch(/^error: usage: zone </);
    expect(run(context, "zone delete")).toMatch(/^error: usage: zone </);
    expect(run(context, "zone 1 2")).toMatch(/^error: usage: zone </);
  });

  it("shows the storage and the stock of a material (plan 3.2)", () => {
    const { context } = createContext();
    expect(run(context, "stock")).toContain("stock: 0 storages");
    run(context, "new 42 steady small");
    const overview = run(context, "stock").split("\n");
    expect(overview[0]).toBe("stock: 1 storages, 16 slots (12 free)");
    expect(overview.some((line) => line.includes("bread: total 12"))).toBe(true);
    expect(overview).toContain("stockpiles:");
    expect(overview.at(-1)).toMatch(
      /^ {2}#9 chest at cell \d+ prio 50 accepts all, 12\/16 slots free: .*12 bread/,
    );
    expect(run(context, "stock oak_log").split("\n")[0]).toBe("stock of oak_log:");
    expect(run(context, "stock gem")).toMatch(/^error: .*gem/);
    expect(run(context, "stock a b")).toBe("error: usage: stock [materialId]");
    run(context, "step 288");
    expect(run(context, "stock oak_log")).toMatch(/#9 chest at cell \d+: \d+/);
  });

  it("inspect shows the skills and traits of a settler (spec 020)", () => {
    const { context } = createContext();
    run(context, "new 5 steady small");
    const bakerLine = run(context, "entities baker")
      .split("\n")
      .find((line) => line.includes("baker"));
    const bakerId = Number(/#(\d+)/.exec(bakerLine ?? "")?.[1]);
    const lines = run(context, `inspect ${bakerId}`).split("\n");
    expect(lines).toContain("  skills: baking 40 (dominant: baking)");
    expect(lines.find((line) => line.startsWith("  traits:"))).toContain("Born baker");
    expect(lines.some((line) => line.startsWith("  Skills: "))).toBe(true);
    expect(run(context, "inspect 1")).not.toContain("skills:");
  });

  it("shows styled names in entities and inspect and the government membership (specs 021, 028)", () => {
    const { context } = createContext();
    run(context, "new 5 steady small");
    const bakerLine = run(context, "entities baker")
      .split("\n")
      .find((line) => line.includes("#"));
    expect(bakerLine).toMatch(
      /^ {2}#\d+ baker \S+.*the Baker {2}\[hunger 80% rest 80% mood 50% \| idle\]$/,
    );
    const bakerId = Number(/#(\d+)/.exec(bakerLine ?? "")?.[1]);
    const lines = run(context, `inspect ${bakerId}`).split("\n");
    expect(lines.some((line) => /^ {2}name: .*the Baker$/.test(line))).toBe(true);
    expect(lines).toContain("  factions: #1 Settlement");
    expect(lines.some((line) => /^ {2}needs: comfort 80%, faith 80%, hunger 80%/.test(line))).toBe(
      true,
    );
    expect(lines).toContain("  action: idle");
    expect(run(context, "inspect 1")).not.toContain("name:");
  });

  it("shows settlers moving between two map snapshots and their needs and action (Checkpoint B)", () => {
    const { context } = createContext();
    run(context, "new 42 steady small");
    const before = run(context, "map");
    const listBefore = run(context, "entities farmer");
    run(context, "step 40");
    const after = run(context, "map");
    const listAfter = run(context, "entities farmer");
    expect(after).not.toBe(before);
    expect(listBefore).toMatch(/\[hunger \d+% rest \d+% mood \d+% \| .+\]/);
    expect(listAfter).toMatch(/\[hunger 7\d% rest 7\d% mood \d+% \| .+\]/);
    const detail = run(context, "inspect 3");
    expect(detail).toMatch(
      / {2}action: (move to cell \d+|stand around|idle|[a-z]+\.[a-z]+ \(\w+\))/,
    );
    expect(detail).toContain("  priorities: hunger > rest > safety > social > comfort > faith");
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
