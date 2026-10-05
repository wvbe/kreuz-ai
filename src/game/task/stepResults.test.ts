import { describe, expect, it } from "vitest";
import {
  childWait,
  continueStep,
  doneStep,
  eventWait,
  failStep,
  predicateWait,
  tickWait,
  waitStep,
} from "./stepResults";
import { StepKind, WaitKind } from "./taskTypes";

describe("step results", () => {
  it("builds the four step kinds as plain JSON", () => {
    expect(continueStep()).toEqual({ kind: StepKind.Continue });
    expect(doneStep()).toEqual({ kind: StepKind.Done });
    expect(failStep("unreachable")).toEqual({ kind: StepKind.Fail, reason: "unreachable" });
    expect(waitStep(tickWait(5))).toEqual({
      kind: StepKind.Wait,
      until: { kind: WaitKind.UntilTick, tick: 5 },
    });
  });

  it("builds the four wait conditions as plain JSON", () => {
    expect(eventWait("a.b")).toEqual({
      kind: WaitKind.Event,
      pattern: "a.b",
      matchKey: null,
      matchValue: null,
    });
    expect(eventWait("a.*", { key: "id", value: 3 })).toEqual({
      kind: WaitKind.Event,
      pattern: "a.*",
      matchKey: "id",
      matchValue: 3,
    });
    expect(childWait(4)).toEqual({ kind: WaitKind.ChildTask, taskId: 4 });
    expect(tickWait(9)).toEqual({ kind: WaitKind.UntilTick, tick: 9 });
    expect(predicateWait("x.y", { count: 1 })).toEqual({
      kind: WaitKind.Predicate,
      predicateId: "x.y",
      params: { count: 1 },
    });
    expect(predicateWait("x.y")).toEqual({
      kind: WaitKind.Predicate,
      predicateId: "x.y",
      params: null,
    });
    expect(JSON.parse(JSON.stringify(eventWait("a.b")))).toEqual(eventWait("a.b"));
  });
});
