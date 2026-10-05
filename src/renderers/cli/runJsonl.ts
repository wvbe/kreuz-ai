import type { GameSession } from "../../game/api/GameSession";
import type { JsonValue } from "../../game/engine/EventBus";

/**
 * The error kind answered for a line that is not a JSON object.
 */
export const badLineKind = "invalid-command";

function badLine(message: string): string {
  return JSON.stringify({ ok: false, error: { kind: badLineKind, message }, events: [] });
}

/**
 * Handles one line of the JSONL protocol and returns the response line.
 *
 * A line is one JSON object: a command (`{"kind":"step","ticks":5}`), a query
 * (`{"query":"state","args":{}}`) or `{"hash":true}`, which answers
 * `{"ok":true,"result":{"hash":"...","tick":N},"events":[]}`. The response is
 * `{"ok":true,"result":...,"events":[...]}` or `{"ok":false,"error":{kind,message,issues?},"events":[]}`.
 * Never throws; a malformed line yields an `invalid-command` error response.
 *
 * @param session - The session to drive.
 * @param line - One input line.
 * @returns The response line (no newline), or null for a blank line.
 */
export function handleJsonlLine(session: GameSession, line: string): string | null {
  const text = line.trim();
  if (text === "") {
    return null;
  }
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text) as JsonValue; // checked structurally just below
  } catch {
    return badLine("the line is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return badLine("the line must be a JSON object");
  }
  if (Object.hasOwn(parsed, "query")) {
    const name = parsed["query"];
    const args = parsed["args"] ?? {};
    if (typeof name !== "string") {
      return badLine('"query" must be a string');
    }
    const result = session.query.run(name, args);
    return JSON.stringify(
      result.ok
        ? { ok: true, result: result.data, events: [] }
        : { ok: false, error: result.error, events: [] },
    );
  }
  if (parsed["hash"] === true) {
    return JSON.stringify({
      ok: true,
      result: { hash: session.stateHash(), tick: session.tick },
      events: [],
    });
  }
  const result = session.dispatch(parsed);
  return JSON.stringify(
    result.ok
      ? { ok: true, result: result.data, events: result.events }
      : { ok: false, error: result.error, events: [] },
  );
}

/**
 * Runs the JSONL protocol: one response line per non-blank input line, until the input ends.
 *
 * @param session - The session to drive.
 * @param lines - The input lines.
 * @param write - Receives each response line (without newline).
 */
export async function runJsonl(
  session: GameSession,
  lines: AsyncIterable<string>,
  write: (line: string) => void,
): Promise<void> {
  for await (const line of lines) {
    const response = handleJsonlLine(session, line);
    if (response !== null) {
      write(response);
    }
  }
}
