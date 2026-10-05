import { GameSession } from "../../game/api/GameSession";
import { formatScenarioResult } from "../../game/api/scenario/formatScenarioResult";
import { runScenario } from "../../game/api/scenario/runScenario";
import { parseScenario } from "../../game/api/scenario/Scenario";
import { runJsonl } from "./runJsonl";
import { replPrompt, runRepl } from "./runRepl";
import { createVerbRegistry } from "./verbs/verbRegistry";
import type { FileIo } from "./verbs/Verb";

/**
 * How the CLI runs.
 */
export enum CliMode {
  Repl = "repl",
  Jsonl = "jsonl",
  Script = "script",
  Help = "help",
}

/**
 * Exit codes of the CLI.
 */
export enum CliExit {
  Ok = 0,
  /**
   * A scenario assertion or step failed.
   */
  ScenarioFailed = 1,
  /**
   * Bad arguments, an unreadable file or an invalid scenario.
   */
  Usage = 2,
}

/**
 * Parsed command line.
 */
export type CliArgs =
  | { mode: CliMode.Repl | CliMode.Jsonl | CliMode.Help }
  | { mode: CliMode.Script; scriptPath: string }
  | { mode: null; error: string };

/**
 * Everything the CLI touches outside the game, injected so it runs in-process under test.
 */
export type CliIo = {
  /**
   * Input lines (stdin).
   */
  lines: AsyncIterable<string>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  files: FileIo;
  /**
   * Seed source for a `new` without a seed in the REPL; JSONL and script modes have none.
   */
  entropy: () => number;
  /**
   * True when stdin is a terminal: the REPL then prints a prompt.
   */
  interactive: boolean;
};

/**
 * Usage text printed for `--help`.
 */
export const cliUsage = [
  "usage: cli [--jsonl | --script <scenario.json> | --help]",
  "  (no flag)           interactive shell; type `help`",
  "  --jsonl             one JSON command or query per stdin line, one JSON response per stdout line",
  "  --script <file>     run a scenario file; exit 1 on the first failing step, 2 on bad input",
].join("\n");

/**
 * Parses the command line.
 *
 * @param argv - Arguments after the program name.
 * @returns The mode (and script path), or an error message.
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const [first, second, ...rest] = argv;
  if (first === undefined) {
    return { mode: CliMode.Repl };
  }
  if (first === "--help" || first === "-h") {
    return { mode: CliMode.Help };
  }
  if (first === "--jsonl" && second === undefined) {
    return { mode: CliMode.Jsonl };
  }
  if (first === "--script" && second !== undefined && rest.length === 0) {
    return { mode: CliMode.Script, scriptPath: second };
  }
  return { mode: null, error: `unrecognised arguments: ${argv.join(" ")}` };
}

function runScript(scriptPath: string, host: CliIo): CliExit {
  let text: string;
  try {
    text = host.files.readText(scriptPath);
  } catch (thrown) {
    host.stderr(
      `cannot read ${scriptPath}: ${thrown instanceof Error ? thrown.message : String(thrown)}\n`,
    );
    return CliExit.Usage;
  }
  const parsed = parseScenario(text);
  if (!parsed.ok) {
    host.stderr(
      `invalid scenario ${scriptPath}:\n${parsed.issues.map((issue) => `  ${issue}`).join("\n")}\n`,
    );
    return CliExit.Usage;
  }
  const result = runScenario(parsed.scenario);
  if (result.ok) {
    host.stdout(`${formatScenarioResult(result)}\n`);
    return CliExit.Ok;
  }
  host.stderr(`${formatScenarioResult(result)}\n`);
  return CliExit.ScenarioFailed;
}

/**
 * Runs the CLI in the mode the arguments select and returns the exit code. Output goes to
 * `host.stdout`; `host.stderr` is used only for fatal errors and scenario failures.
 *
 * @param argv - Arguments after the program name.
 * @param host - Input, output, files and entropy.
 * @returns The exit code (see {@link CliExit}).
 */
export async function runCli(argv: readonly string[], host: CliIo): Promise<CliExit> {
  const args = parseCliArgs(argv);
  switch (args.mode) {
    case null:
      host.stderr(`${args.error}\n${cliUsage}\n`);
      return CliExit.Usage;
    case CliMode.Help:
      host.stdout(`${cliUsage}\n`);
      return CliExit.Ok;
    case CliMode.Script:
      return runScript(args.scriptPath, host);
    case CliMode.Jsonl:
      await runJsonl(new GameSession(), host.lines, (line) => {
        host.stdout(`${line}\n`);
      });
      return CliExit.Ok;
    case CliMode.Repl: {
      const session = new GameSession(undefined, { entropy: host.entropy });
      const verbs = createVerbRegistry();
      host.stdout("Kreuzvibe terminal. Type `help` for the commands, `quit` to leave.\n");
      await runRepl(
        { session, files: host.files, verbs },
        host.lines,
        host.stdout,
        host.interactive ? replPrompt : "",
      );
      return CliExit.Ok;
    }
  }
}
