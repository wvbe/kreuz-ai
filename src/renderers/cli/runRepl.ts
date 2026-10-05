import type { VerbContext, VerbOutput } from "./verbs/Verb";

/**
 * The text shown before each line of an interactive session.
 */
export const replPrompt = "kreuz> ";

/**
 * Runs one REPL line: the first word selects the verb, the rest are its arguments. Blank lines and
 * `#` comments do nothing. A verb that throws is reported as an error instead of crashing the shell.
 *
 * @param context - Session, file access and the verb list.
 * @param line - The raw input line.
 * @returns The output, or null for a blank line or comment.
 */
export function executeReplLine(context: VerbContext, line: string): VerbOutput | null {
  const words = line
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");
  const [name, ...args] = words;
  if (name === undefined || name.startsWith("#")) {
    return null;
  }
  const verb = context.verbs.find((candidate) => candidate.name === name);
  if (verb === undefined) {
    return { ok: false, text: `error: unknown command "${name}"; try \`help\`` };
  }
  try {
    return verb.run(args, context);
  } catch (thrown) {
    return {
      ok: false,
      text: `error: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    };
  }
}

/**
 * Runs the interactive loop until the input ends or a verb asks to quit. No timers: it only
 * reacts to input lines.
 *
 * @param context - Session, file access and the verb list.
 * @param lines - The input lines.
 * @param write - Receives output text; a trailing newline is the caller's business.
 * @param prompt - Written before each read ("" when input is piped).
 */
export async function runRepl(
  context: VerbContext,
  lines: AsyncIterable<string>,
  write: (text: string) => void,
  prompt: string,
): Promise<void> {
  write(prompt);
  for await (const line of lines) {
    const output = executeReplLine(context, line);
    if (output !== null) {
      write(`${output.text}\n`);
      if (output.quit === true) {
        return;
      }
    }
    write(prompt);
  }
  if (prompt !== "") {
    write("\n");
  }
}
