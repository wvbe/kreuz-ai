import { describe, expect, it } from "vitest";
import { JobError, JobErrorKind } from "./JobError";

describe("JobError", () => {
  it("carries a kind and message", () => {
    const error = new JobError(JobErrorKind.UnknownBoard, "entity 9 is not a job board");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("JobError");
    expect(error.kind).toBe(JobErrorKind.UnknownBoard);
    expect(error.message).toBe("entity 9 is not a job board");
    expect(JobErrorKind.ContentLocked).toBe("content-locked");
    expect(JobErrorKind.BoardNotUserManaged).toBe("board-not-user-managed");
    expect(JobErrorKind.UnknownUpdate).toBe("unknown-update");
    expect(JobErrorKind.IneligibleCrier).toBe("ineligible-crier");
  });
});
