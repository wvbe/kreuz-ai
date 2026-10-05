import { describe, expect, it } from "vitest";
import { TaskError, TaskErrorKind } from "./TaskError";

describe("TaskError", () => {
  it("carries its kind and message", () => {
    const error = new TaskError(TaskErrorKind.UnknownTask, "no task 3");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TaskError");
    expect(error.kind).toBe(TaskErrorKind.UnknownTask);
    expect(error.message).toBe("no task 3");
  });
});
