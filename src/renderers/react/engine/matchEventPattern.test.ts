import { describe, expect, it } from "vitest";
import { matchEventPattern } from "./matchEventPattern";

describe("matchEventPattern", () => {
  it("matches exact names and single-segment wildcards", () => {
    expect(matchEventPattern("command.rejected", "command.rejected")).toBe(true);
    expect(matchEventPattern("command.*", "command.rejected")).toBe(true);
    expect(matchEventPattern("command.*", "command.a.b")).toBe(false);
    expect(matchEventPattern("command.*", "command")).toBe(false);
    expect(matchEventPattern("command.applied", "command.rejected")).toBe(false);
  });

  it("matches any depth with a double star", () => {
    expect(matchEventPattern("**", "a")).toBe(true);
    expect(matchEventPattern("**", "a.b.c")).toBe(true);
    expect(matchEventPattern("housing.**", "housing.dwelling.at-risk")).toBe(true);
    expect(matchEventPattern("housing.**", "trade.order")).toBe(false);
    expect(matchEventPattern("a.**.c", "a.b.x.c")).toBe(true);
  });
});
