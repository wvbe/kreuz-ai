import { z } from "zod";
import { GameEngineError, GameEngineErrorKind } from "../engine/GameEngineError";
import { InvalidOptionsError } from "../engine/InvalidOptionsError";
import { InvalidSaveFormatError } from "../save/InvalidSaveFormatError";
import { UnsupportedSaveVersionError } from "../save/UnsupportedSaveVersionError";
import { GameTimeError } from "../time/GameTime";
import { ApiError, ApiErrorKind } from "./ApiError";

/**
 * Formats Zod issues as `path: message` lines (the root path is shown as `(payload)`).
 *
 * @param issues - Issues of a failed Zod parse.
 * @returns One line per issue.
 */
export function formatZodIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.map((part) => String(part)).join(".");
    return `${path === "" ? "(payload)" : path}: ${issue.message}`;
  });
}

const gameEngineKinds: { [kind in GameEngineErrorKind]: ApiErrorKind } = {
  [GameEngineErrorKind.NoGame]: ApiErrorKind.NoGame,
  [GameEngineErrorKind.MissingEntropy]: ApiErrorKind.MissingEntropy,
  [GameEngineErrorKind.InitFailed]: ApiErrorKind.InitFailed,
  [GameEngineErrorKind.DuplicateCommandHandler]: ApiErrorKind.CommandFailed,
  [GameEngineErrorKind.DuplicateQuery]: ApiErrorKind.CommandFailed,
};

/**
 * Converts anything thrown by the engine, a command handler or a query into an {@link ApiError}
 * with the closest kind; typed engine errors keep their details (`issues`).
 *
 * @param failure - The caught value.
 * @returns The same instance when it already is an `ApiError`, otherwise a new one.
 */
export function toApiError(
  // eslint-disable-next-line no-restricted-syntax -- catch-clause boundary: any value can be thrown
  failure: unknown,
): ApiError {
  if (failure instanceof ApiError) {
    return failure;
  }
  if (failure instanceof InvalidOptionsError) {
    return new ApiError(ApiErrorKind.InvalidOptions, failure.message, failure.issues);
  }
  if (failure instanceof InvalidSaveFormatError) {
    return new ApiError(ApiErrorKind.InvalidSaveFormat, failure.message, failure.issues);
  }
  if (failure instanceof UnsupportedSaveVersionError) {
    return new ApiError(ApiErrorKind.UnsupportedSaveVersion, failure.message);
  }
  if (failure instanceof GameEngineError) {
    return new ApiError(gameEngineKinds[failure.kind], failure.message);
  }
  if (failure instanceof GameTimeError) {
    return new ApiError(ApiErrorKind.InvalidArgument, failure.message);
  }
  if (failure instanceof z.ZodError) {
    return new ApiError(
      ApiErrorKind.InvalidPayload,
      "validation failed",
      formatZodIssues(failure.issues),
    );
  }
  if (failure instanceof Error) {
    return new ApiError(ApiErrorKind.CommandFailed, failure.message);
  }
  return new ApiError(ApiErrorKind.Internal, `non-error value thrown: ${String(failure)}`);
}
