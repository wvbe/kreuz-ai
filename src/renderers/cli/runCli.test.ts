import { describe, expect, it } from "vitest";
import { CliExit, CliMode, cliUsage, parseCliArgs, runCli } from "./runCli";
import type { CliIo } from "./runCli";

function createIo(
  inputLines: string[] = [],
  disk: { [path: string]: string } = {},
): { host: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  async function* lines(): AsyncGenerator<string> {
    await Promise.resolve();
    yield* inputLines;
  }
  const host: CliIo = {
    lines: lines(),
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    files: {
      readText: (path) => {
        const text = disk[path];
        if (text === undefined) {
          throw new Error("ENOENT");
        }
        return text;
      },
      writeText: (path, text) => {
        disk[path] = text;
      },
    },
    entropy: () => 5,
    interactive: false,
  };
  return { host, out, err };
}

const passing = JSON.stringify({
  name: "ok",
  seed: 1,
  steps: [{ step: 3 }, { assert: { query: "time", path: "tick", op: "eq", value: 3 } }],
});
const failing = JSON.stringify({
  name: "bad",
  seed: 1,
  steps: [{ step: 3 }, { assert: { query: "time", path: "tick", op: "eq", value: 4 } }],
});

describe("parseCliArgs", () => {
  it("selects the mode", () => {
    expect(parseCliArgs([])).toEqual({ mode: CliMode.Repl });
    expect(parseCliArgs(["--jsonl"])).toEqual({ mode: CliMode.Jsonl });
    expect(parseCliArgs(["--help"])).toEqual({ mode: CliMode.Help });
    expect(parseCliArgs(["-h"])).toEqual({ mode: CliMode.Help });
    expect(parseCliArgs(["--script", "a.json"])).toEqual({
      mode: CliMode.Script,
      scriptPath: "a.json",
    });
  });

  it("rejects anything else", () => {
    expect(parseCliArgs(["--script"])).toMatchObject({ mode: null });
    expect(parseCliArgs(["--jsonl", "x"])).toMatchObject({ mode: null });
    expect(parseCliArgs(["--nope"])).toMatchObject({ mode: null });
  });
});

describe("runCli", () => {
  it("prints usage for --help and for bad arguments", async () => {
    const help = createIo();
    expect(await runCli(["--help"], help.host)).toBe(CliExit.Ok);
    expect(help.out.join("")).toContain(cliUsage);
    const bad = createIo();
    expect(await runCli(["--wat"], bad.host)).toBe(CliExit.Usage);
    expect(bad.err.join("")).toContain("unrecognised arguments");
  });

  it("serves the JSONL protocol", async () => {
    const { host, out, err } = createIo([
      '{"kind":"new-game","options":{"seed":2}}',
      '{"hash":true}',
    ]);
    expect(await runCli(["--jsonl"], host)).toBe(CliExit.Ok);
    expect(out).toHaveLength(2);
    expect(out.every((line) => line.endsWith("\n"))).toBe(true);
    expect(err).toEqual([]);
  });

  it("runs a passing script", async () => {
    const { host, out } = createIo([], { "ok.json": passing });
    expect(await runCli(["--script", "ok.json"], host)).toBe(CliExit.Ok);
    expect(out.join("")).toContain("PASS ok");
  });

  it("fails a script with a readable message", async () => {
    const { host, err } = createIo([], { "bad.json": failing });
    expect(await runCli(["--script", "bad.json"], host)).toBe(CliExit.ScenarioFailed);
    expect(err.join("")).toContain("FAIL bad: step #1");
  });

  it("reports unreadable and invalid scripts", async () => {
    const missing = createIo();
    expect(await runCli(["--script", "nope.json"], missing.host)).toBe(CliExit.Usage);
    expect(missing.err.join("")).toContain("cannot read nope.json");
    const invalid = createIo([], { "x.json": '{"name":""}' });
    expect(await runCli(["--script", "x.json"], invalid.host)).toBe(CliExit.Usage);
    expect(invalid.err.join("")).toContain("invalid scenario");
  });

  it("runs the REPL by default", async () => {
    const { host, out } = createIo(["new", "status", "quit"]);
    expect(await runCli([], host)).toBe(CliExit.Ok);
    expect(out.join("")).toContain("seed 5");
  });
});
