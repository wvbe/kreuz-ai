import type { GameSession } from "../../../game/api/GameSession";

/**
 * File access the `save` and `load` verbs use; injected so tests need no disk.
 */
export type FileIo = {
  readText: (path: string) => string;
  writeText: (path: string, text: string) => void;
};

/**
 * What a verb can reach: the session, the file access and the verb list (for `help`).
 */
export type VerbContext = {
  session: GameSession;
  files: FileIo;
  verbs: readonly Verb[];
};

/**
 * What a verb printed. `ok: false` marks a usage or game error; `quit` ends the REPL.
 */
export type VerbOutput = {
  ok: boolean;
  text: string;
  quit?: boolean;
};

/**
 * One REPL command. Verbs live in groups, one file per group under `verbs/`, and are listed in
 * `verbRegistry.ts`.
 */
export type Verb = {
  name: string;
  /**
   * Usage line, e.g. `step [n]`.
   */
  usage: string;
  /**
   * One-line description for `help`.
   */
  summary: string;
  run: (args: readonly string[], context: VerbContext) => VerbOutput;
};

/**
 * Builds a successful output.
 *
 * @param lines - Output lines.
 * @returns A verb output with the lines joined by newlines.
 */
export function verbDone(lines: readonly string[]): VerbOutput {
  return { ok: true, text: lines.join("\n") };
}

/**
 * Builds a failed output.
 *
 * @param message - What went wrong.
 * @returns A verb output prefixed with `error:`.
 */
export function verbFailed(message: string): VerbOutput {
  return { ok: false, text: `error: ${message}` };
}

/**
 * Parses a non-negative integer argument.
 *
 * @param text - The argument text, or undefined when absent.
 * @returns The integer, or null when absent or not an integer.
 */
export function parseCount(text: string | undefined): number | null {
  return text !== undefined && /^\d+$/.test(text) ? Number(text) : null;
}
