import { describe, expect, it } from "vitest";
import { deferredJobTypeIds, findUnhandledJobTypes } from "./jobCoverage";
import { createJobWorld } from "./testJobWorld";

describe("findUnhandledJobTypes", () => {
  it("finds nothing: every v0 job type has an executor or is deferred", () => {
    const world = createJobWorld();
    expect(findUnhandledJobTypes(world.engine)).toEqual([]);
  });

  it("deferred types have no executor and are real content", () => {
    const world = createJobWorld();
    for (const id of deferredJobTypeIds) {
      expect(world.engine.content.jobs.has(id)).toBe(true);
      expect(world.engine.taskHandlers.has(id)).toBe(false);
    }
  });

  it("reports a job type that is neither handled nor deferred", () => {
    const world = createJobWorld();
    expect(findUnhandledJobTypes(world.engine, [])).toEqual(["farm.tend"]);
  });
});
