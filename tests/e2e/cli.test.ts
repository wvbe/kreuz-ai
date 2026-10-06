import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Child processes start slowly on a loaded machine (D-114).
vi.setConfig({ testTimeout: 300_000 });

// Child-process e2e: spawns the real CLI with the local vite-node (no browser, no network).

const root = join(__dirname, "..", "..");
const viteNode = join(root, "node_modules", "vite-node", "dist", "cli.mjs");
const entry = join("src", "renderers", "cli", "main.ts");

type Ran = { status: number | null; stdout: string; stderr: string };

type JsonlResponse = {
  ok: boolean;
  result: { [key: string]: string | number | boolean | null };
  error?: { kind: string };
  events: { name: string }[];
};

function runCli(args: string[], input = ""): Ran {
  const ran = spawnSync(process.execPath, [viteNode, entry, "--", ...args], {
    cwd: root,
    input,
    encoding: "utf8",
    timeout: 300_000,
  });
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr };
}

function jsonl(commands: object[], args = ["--jsonl"]): { ran: Ran; responses: JsonlResponse[] } {
  const ran = runCli(args, commands.map((command) => JSON.stringify(command)).join("\n") + "\n");
  const responses = ran.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as JsonlResponse);
  return { ran, responses };
}

function finalHash(seed: number): string {
  const { ran, responses } = jsonl([
    { kind: "new-game", options: { seed, mapSize: 0 } },
    { kind: "step", ticks: 150 },
    { kind: "set-speed", speed: 2000 },
    { kind: "step", ticks: 50 },
    { hash: true },
  ]);
  expect(ran.status).toBe(0);
  return String(responses[responses.length - 1]?.result["hash"]);
}

describe("cli --jsonl", () => {
  it("creates, steps, saves and loads a game and exits cleanly at EOF", () => {
    const first = jsonl([
      { kind: "new-game", options: { seed: 11, mapSize: 0 } },
      { kind: "step", ticks: 25 },
      { kind: "save-game" },
      { hash: true },
    ]);
    expect(first.ran.status).toBe(0);
    expect(first.ran.stderr).toBe("");
    expect(first.responses).toHaveLength(4);
    expect(first.responses[0]).toMatchObject({ ok: true, result: { seed: 11 } });
    expect(first.responses[0]?.events.map((event) => event.name)).toContain("game.started");
    expect(first.responses[1]).toMatchObject({ ok: true, result: { tick: 25 } });
    const saved = first.responses[2]?.result;
    expect(typeof saved).toBe("string");

    const second = jsonl([{ kind: "load-game", save: saved }, { hash: true }, { query: "time" }]);
    expect(second.ran.status).toBe(0);
    expect(second.responses[0]?.ok).toBe(true);
    expect(second.responses[2]).toMatchObject({ ok: true, result: { tick: 25 } });
    expect(second.responses[1]?.result["hash"]).toBe(first.responses[3]?.result["hash"]);
  });

  it("answers errors in-band and keeps going", () => {
    const { ran, responses } = jsonl([
      { kind: "step", ticks: 1 },
      { kind: "nope" },
      { query: "state" },
    ]);
    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe("");
    expect(responses.map((response) => response.error?.kind)).toEqual([
      "no-game",
      "unknown-command",
      undefined,
    ]);
    expect(responses[2]?.result).toMatchObject({ hasGame: false });
  });

  it("works through the npm-style double dash argument", () => {
    expect(jsonl([{ query: "state" }]).responses).toHaveLength(1);
  });
});

describe("cli --script", () => {
  it("exits 0 for a passing scenario", () => {
    const ran = runCli(["--script", "scenarios/kernel-smoke.json"]);
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain("PASS kernel-smoke");
  });

  it("plays Checkpoint C through the real CLI process: farm, bakery, bread, nobody starves", () => {
    const ran = runCli(["--script", "scenarios/checkpoint-c.json"]);
    expect(ran.status).toBe(0);
    expect(ran.stdout).toMatch(/^PASS checkpoint-c: \d+ steps, tick 2880, hash [0-9a-f]{16}/);
    const again = runCli(["--script", "scenarios/checkpoint-c.json"]);
    expect(again.stdout).toBe(ran.stdout);
  }, 400_000);

  it("exits 1 with a readable message for a failing scenario", () => {
    const ran = runCli(["--script", "tests/e2e/fixtures/failing.json"]);
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain("FAIL deliberately-failing: step #1");
    expect(ran.stderr).toContain("expected: 6");
    expect(ran.stderr).toContain("actual:   5");
  });

  it("exits 2 for invalid or missing scenario files", () => {
    const invalid = runCli(["--script", "tests/e2e/fixtures/invalid.json"]);
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain("invalid scenario");
    expect(runCli(["--script", "tests/e2e/fixtures/missing.json"]).status).toBe(2);
    expect(runCli(["--bogus"]).status).toBe(2);
  }, 400_000); // three child processes: each boot loads the whole game under the coverage load
});

describe("cli determinism", () => {
  it("two processes with the same seed end in the identical state hash", () => {
    const first = finalHash(77);
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(finalHash(77)).toBe(first);
  });

  it("another seed ends in another hash", () => {
    expect(finalHash(78)).not.toBe(finalHash(77));
  });
});

describe("cli repl", () => {
  it("drives a game from piped lines, including save and load files", () => {
    const dir = mkdtempSync(join(tmpdir(), "kreuz-cli-"));
    try {
      const file = join(dir, "game.json");
      const ran = runCli(
        [],
        [
          "new 5 steady small",
          "step 20",
          "status",
          `save ${file}`,
          "step 5",
          `load ${file}`,
          "status",
          "map",
          "quit",
        ].join("\n") + "\n",
      );
      expect(ran.status).toBe(0);
      expect(ran.stdout).toContain("seed 5  difficulty steady");
      expect(ran.stdout).toContain("loaded");
      expect(ran.stdout).toContain("tick 20  day 0");
      expect(ran.stdout).toContain("map 1 (voronoi, 600 cells, 72x36 characters)");
      expect(readFileSync(file, "utf8")).toContain("seed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
