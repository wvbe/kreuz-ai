import { describe, expect, it } from "vitest";
import { parseScenario } from "./Scenario";

describe("parseScenario", () => {
  it("accepts a minimal scenario", () => {
    const parsed = parseScenario('{"name":"a","seed":1,"steps":[{"step":2}]}');
    expect(parsed).toEqual({ ok: true, scenario: { name: "a", seed: 1, steps: [{ step: 2 }] } });
  });

  it("keeps options", () => {
    const parsed = parseScenario('{"name":"a","seed":1,"options":{"mapSize":0},"steps":[]}');
    expect(parsed.ok && parsed.scenario.options).toEqual({ mapSize: 0 });
  });

  it("reports invalid JSON", () => {
    const parsed = parseScenario("{nope");
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.issues[0]).toContain("not valid JSON");
  });

  it("reports schema issues with paths", () => {
    const parsed = parseScenario('{"name":"","seed":-1,"steps":[1],"extra":true}');
    expect(parsed.ok).toBe(false);
    const issues = parsed.ok ? [] : parsed.issues.join("\n");
    expect(issues).toContain("name");
    expect(issues).toContain("seed");
    expect(issues).toContain("steps.0");
  });

  it("rejects non-integer numbers anywhere in a step", () => {
    expect(parseScenario('{"name":"a","seed":1,"steps":[{"step":1.5}]}').ok).toBe(false);
  });
});
