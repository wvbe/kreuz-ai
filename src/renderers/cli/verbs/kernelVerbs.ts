import { CommandKind } from "../../../game/api/Command";
import type { CommandResult } from "../../../game/api/CommandResult";
import { evaluateAssertion, getPathValue } from "../../../game/api/scenario/assertion";
import type { AssertOp } from "../../../game/api/scenario/assertion";
import { formatEvents, formatStatus } from "../formatViews";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb, VerbOutput } from "./Verb";

const mapSizes: { readonly [name: string]: number } = { small: 0, medium: 1, large: 2 };

const speeds: { readonly [name: string]: number } = {
  quarter: 250,
  half: 500,
  normal: 1000,
  double: 2000,
  quadruple: 4000,
};

const operators: readonly string[] = ["eq", "gt", "gte", "lt", "lte", "exists", "includes"];

const defaultRunLimit = 10_000;

function failure(result: CommandResult): VerbOutput | null {
  return result.ok ? null : verbFailed(`${result.error.kind}: ${result.error.message}`);
}

function withEvents(lines: readonly string[], result: CommandResult): VerbOutput {
  return verbDone(result.ok ? [...lines, ...formatEvents(result.events)] : lines);
}

function parseValue(text: string): string | number | boolean | null {
  if (/^-?\d+$/.test(text)) {
    return Number(text);
  }
  return text === "true" ? true : text === "false" ? false : text === "null" ? null : text;
}

/**
 * Verbs that drive the game clock and storage: new, step, run-until, pause, resume, speed,
 * status, save, load.
 */
export const kernelVerbs: readonly Verb[] = [
  {
    name: "new",
    usage: "new [seed] [difficulty] [mapSize]",
    summary: "start a game (difficulty peaceful|steady|harsh; mapSize 0-2 or small|medium|large)",
    run: (args, { session }) => {
      const options: { [name: string]: string | number } = {};
      if (args[0] !== undefined) {
        const seed = parseCount(args[0]);
        if (seed === null) {
          return verbFailed(`seed must be a non-negative integer, got "${args[0]}"`);
        }
        options["seed"] = seed;
      }
      if (args[1] !== undefined) {
        options["difficulty"] = args[1];
      }
      if (args[2] !== undefined) {
        const size = mapSizes[args[2]] ?? parseCount(args[2]);
        if (size === null || size === undefined) {
          return verbFailed(`mapSize must be 0, 1, 2, small, medium or large, got "${args[2]}"`);
        }
        options["mapSize"] = size;
      }
      const result = session.newGame(options);
      if (!result.ok) {
        return failure(result) ?? verbFailed("new game failed");
      }
      return withEvents(["new game: " + JSON.stringify(result.data)], result);
    },
  },
  {
    name: "step",
    usage: "step [n]",
    summary: "advance n ticks (default 1)",
    run: (args, { session }) => {
      const ticks = args[0] === undefined ? 1 : parseCount(args[0]);
      if (ticks === null || ticks < 1) {
        return verbFailed(`n must be a positive integer, got "${args[0] ?? ""}"`);
      }
      const result = session.step(ticks);
      return (
        failure(result) ??
        withEvents(
          [`tick ${session.tick}${session.query.time().paused ? " (paused: no tick ran)" : ""}`],
          result,
        )
      );
    },
  },
  {
    name: "run-until",
    usage: "run-until <path> <op> <value> [maxTicks]",
    summary: "step until a path of the `state` view matches, e.g. run-until time.tick gte 500",
    run: (args, { session }) => {
      const [path, operator, value, limitText] = args;
      if (path === undefined || operator === undefined || !operators.includes(operator)) {
        return verbFailed(`usage: run-until <path> <${operators.join("|")}> <value> [maxTicks]`);
      }
      const maxTicks = limitText === undefined ? defaultRunLimit : parseCount(limitText);
      if (maxTicks === null) {
        return verbFailed(`maxTicks must be a non-negative integer, got "${limitText ?? ""}"`);
      }
      const expected = value === undefined ? undefined : parseValue(value);
      const result = session.runUntil((view) => {
        const state = view.run("state");
        return (
          state.ok &&
          evaluateAssertion(operator as AssertOp, getPathValue(state.data, path), expected)
        );
      }, maxTicks);
      if (!result.ok) {
        return verbFailed(`${result.error.kind}: ${result.error.message}`);
      }
      return verbDone([
        `${result.stopReason}: ran ${result.ticksRun} ticks, now tick ${result.tick}`,
        ...formatEvents(result.events),
      ]);
    },
  },
  {
    name: "pause",
    usage: "pause",
    summary: "pause the clock",
    run: (_args, { session }) => {
      const result = session.dispatch({ kind: CommandKind.Pause });
      return failure(result) ?? withEvents(["paused"], result);
    },
  },
  {
    name: "resume",
    usage: "resume",
    summary: "resume the clock",
    run: (_args, { session }) => {
      const result = session.dispatch({ kind: CommandKind.Resume });
      return failure(result) ?? withEvents(["running"], result);
    },
  },
  {
    name: "speed",
    usage: "speed [quarter|half|normal|double|quadruple]",
    summary: "show or set the speed multiplier setting",
    run: (args, { session }) => {
      if (args[0] === undefined) {
        return verbDone([`speed ${session.query.time().speed}`]);
      }
      const speed = speeds[args[0]] ?? parseCount(args[0]);
      if (speed === null || speed === undefined) {
        return verbFailed(`unknown speed "${args[0]}"`);
      }
      const result = session.dispatch({ kind: CommandKind.SetSpeed, speed });
      return failure(result) ?? withEvents([`speed ${speed}`], result);
    },
  },
  {
    name: "status",
    usage: "status",
    summary: "show time, seed and counts",
    run: (_args, { session }) => verbDone(formatStatus(session.query.state())),
  },
  {
    name: "save",
    usage: "save <file>",
    summary: "write the game to a file",
    run: (args, { session, files }) => {
      if (args[0] === undefined) {
        return verbFailed("usage: save <file>");
      }
      const result = session.save();
      if (!result.ok || typeof result.data !== "string") {
        return failure(result) ?? verbFailed("the save is not text");
      }
      files.writeText(args[0], result.data);
      return verbDone([`saved ${result.data.length} characters to ${args[0]}`]);
    },
  },
  {
    name: "load",
    usage: "load <file>",
    summary: "replace the game with a saved one",
    run: (args, { session, files }) => {
      if (args[0] === undefined) {
        return verbFailed("usage: load <file>");
      }
      let text: string;
      try {
        text = files.readText(args[0]);
      } catch (thrown) {
        return verbFailed(thrown instanceof Error ? thrown.message : String(thrown));
      }
      const result = session.load(text);
      return failure(result) ?? withEvents([`loaded ${args[0]}, tick ${session.tick}`], result);
    },
  },
];
