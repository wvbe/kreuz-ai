import { describe, expect, it } from "vitest";
import { formatScenarioResult } from "./formatScenarioResult";

describe("formatScenarioResult", () => {
  it("renders a pass on one line", () => {
    expect(
      formatScenarioResult({ ok: true, name: "demo", stepsRun: 3, tick: 9, finalHash: "abc" }),
    ).toBe("PASS demo: 3 steps, tick 9, hash abc");
  });

  it("renders a failure with expected and actual", () => {
    const text = formatScenarioResult({
      ok: false,
      name: "demo",
      stepsRun: 2,
      failure: { stepIndex: 2, message: "assertion failed", expected: 5, actual: 4 },
    });
    expect(text).toBe(
      ["FAIL demo: step #2: assertion failed", "  expected: 5", "  actual:   4"].join("\n"),
    );
  });

  it("names the initial new-game and omits missing values", () => {
    const text = formatScenarioResult({
      ok: false,
      name: "demo",
      stepsRun: 0,
      failure: { stepIndex: -1, message: "new-game failed" },
    });
    expect(text).toBe("FAIL demo: step new-game: new-game failed");
  });
});
