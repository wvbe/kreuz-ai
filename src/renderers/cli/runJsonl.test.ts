import { describe, expect, it } from "vitest";
import { GameSession } from "../../game/api/GameSession";
import { badLineKind, handleJsonlLine, runJsonl } from "./runJsonl";

type Response = {
  ok: boolean;
  result?: { [key: string]: number | string | boolean | null };
  error?: { kind: string };
  events: { name: string }[];
};

function respond(session: GameSession, line: string): Response {
  const text = handleJsonlLine(session, line);
  if (text === null) {
    throw new Error("expected a response");
  }
  return JSON.parse(text) as Response;
}

describe("handleJsonlLine", () => {
  it("answers commands with result and events", () => {
    const session = new GameSession();
    const started = respond(session, '{"kind":"new-game","options":{"seed":3}}');
    expect(started.ok).toBe(true);
    expect(started.result).toMatchObject({ seed: 3 });
    expect(started.events.map((event) => event.name)).toContain("game.started");
    expect(respond(session, '{"kind":"step","ticks":4}').result).toMatchObject({ tick: 4 });
  });

  it("answers queries and the hash line", () => {
    const session = new GameSession();
    respond(session, '{"kind":"new-game","options":{"seed":3}}');
    expect(respond(session, '{"query":"time"}').result).toMatchObject({ tick: 0 });
    expect(respond(session, '{"query":"entity","args":{"id":1}}').result).toMatchObject({ id: 1 });
    const hash = respond(session, '{"hash":true}');
    expect(hash.result).toMatchObject({ tick: 0 });
    expect(hash.result?.["hash"]).toBe(session.stateHash());
  });

  it("reports errors without throwing", () => {
    const session = new GameSession();
    expect(respond(session, '{"kind":"step","ticks":1}').error?.kind).toBe("no-game");
    expect(respond(session, '{"kind":"dance"}').error?.kind).toBe("unknown-command");
    expect(respond(session, '{"query":"nothing"}').error?.kind).toBe("unknown-query");
    expect(respond(session, '{"query":5}').error?.kind).toBe(badLineKind);
    expect(respond(session, "{oops").error?.kind).toBe(badLineKind);
    expect(respond(session, "[1]").error?.kind).toBe(badLineKind);
    expect(respond(session, "{}").error?.kind).toBe("invalid-command");
  });

  it("skips blank lines", () => {
    expect(handleJsonlLine(new GameSession(), "  ")).toBeNull();
  });
});

describe("runJsonl", () => {
  it("writes one response per non-blank line and ends at EOF", async () => {
    async function* lines(): AsyncGenerator<string> {
      await Promise.resolve();
      yield '{"kind":"new-game","options":{"seed":1}}';
      yield "";
      yield '{"query":"state"}';
    }
    const out: string[] = [];
    await runJsonl(new GameSession(), lines(), (line) => out.push(line));
    expect(out).toHaveLength(2);
    expect(JSON.parse(out[1] ?? "{}")).toMatchObject({ ok: true, result: { seed: 1 } });
  });
});
