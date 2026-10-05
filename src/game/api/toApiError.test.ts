import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GameEngineError, GameEngineErrorKind } from "../engine/GameEngineError";
import { InvalidOptionsError } from "../engine/InvalidOptionsError";
import { InvalidSaveFormatError } from "../save/InvalidSaveFormatError";
import { UnsupportedSaveVersionError } from "../save/UnsupportedSaveVersionError";
import { GameTimeError } from "../time/GameTime";
import { ApiError, ApiErrorKind } from "./ApiError";
import { formatZodIssues, toApiError } from "./toApiError";

describe("formatZodIssues", () => {
  it("prints path and message, with (payload) for the root", () => {
    const nested = z
      .object({ outer: z.object({ inner: z.number() }) })
      .safeParse({ outer: { inner: "x" } });
    const root = z.number().safeParse("x");
    expect(nested.success || formatZodIssues(nested.error.issues)[0]).toMatch(/^outer\.inner: /);
    expect(root.success || formatZodIssues(root.error.issues)[0]).toMatch(/^\(payload\): /);
  });
});

describe("toApiError", () => {
  it("keeps an ApiError as is", () => {
    const failure = new ApiError(ApiErrorKind.NotFound, "nope");
    expect(toApiError(failure)).toBe(failure);
  });

  it("maps the typed engine errors to their kinds and keeps issues", () => {
    expect(toApiError(new InvalidOptionsError(["Invalid seed: 1.5."]))).toMatchObject({
      kind: ApiErrorKind.InvalidOptions,
      issues: ["Invalid seed: 1.5."],
    });
    expect(toApiError(new InvalidSaveFormatError("bad", ["x: y"]))).toMatchObject({
      kind: ApiErrorKind.InvalidSaveFormat,
      issues: ["x: y"],
    });
    expect(toApiError(new UnsupportedSaveVersionError(9, 1)).kind).toBe(
      ApiErrorKind.UnsupportedSaveVersion,
    );
    expect(toApiError(new GameEngineError(GameEngineErrorKind.NoGame, "m")).kind).toBe(
      ApiErrorKind.NoGame,
    );
    expect(toApiError(new GameEngineError(GameEngineErrorKind.MissingEntropy, "m")).kind).toBe(
      ApiErrorKind.MissingEntropy,
    );
    expect(toApiError(new GameEngineError(GameEngineErrorKind.InitFailed, "m")).kind).toBe(
      ApiErrorKind.InitFailed,
    );
    expect(toApiError(new GameTimeError("bad speed")).kind).toBe(ApiErrorKind.InvalidArgument);
  });

  it("maps Zod errors, plain errors and non-errors", () => {
    const parsed = z.number().safeParse("x");
    if (parsed.success) throw new Error("expected failure");
    expect(toApiError(parsed.error).kind).toBe(ApiErrorKind.InvalidPayload);
    expect(toApiError(new Error("boom"))).toMatchObject({
      kind: ApiErrorKind.CommandFailed,
      message: "boom",
    });
    expect(toApiError("text").kind).toBe(ApiErrorKind.Internal);
  });
});
