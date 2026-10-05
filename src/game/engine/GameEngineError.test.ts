import { describe, expect, it } from "vitest";
import { GameEngineError, GameEngineErrorKind } from "./GameEngineError";

describe("GameEngineError", () => {
  it("carries a kind, a message and an optional cause", () => {
    const cause = new Error("inner");
    const failure = new GameEngineError(GameEngineErrorKind.InitFailed, "hook failed", cause);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("GameEngineError");
    expect(failure.kind).toBe(GameEngineErrorKind.InitFailed);
    expect(failure.message).toBe("hook failed");
    expect(failure.cause).toBe(cause);
    expect(new GameEngineError(GameEngineErrorKind.NoGame, "x").cause).toBeUndefined();
  });
});
