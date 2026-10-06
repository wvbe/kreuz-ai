import { describe, expect, it } from "vitest";
import { createVerbRegistry, verbGroups } from "./verbRegistry";

describe("createVerbRegistry", () => {
  it("flattens the groups with unique names", () => {
    const names = createVerbRegistry().map((verb) => verb.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "new",
        "step",
        "run-until",
        "pause",
        "resume",
        "speed",
        "status",
        "map",
        "entities",
        "inspect",
        "events",
        "find",
        "cell",
        "jobs",
        "post",
        "pending",
        "crier",
        "stock",
        "zones",
        "zone",
        "orders",
        "order",
        "standing",
        "steward",
        "sites",
        "build",
        "save",
        "load",
        "help",
        "quit",
      ]),
    );
  });

  it("rejects duplicate names", () => {
    const verb = { name: "dup", usage: "dup", summary: "x", run: () => ({ ok: true, text: "" }) };
    expect(() => createVerbRegistry([[verb], [verb]])).toThrow('duplicate CLI verb "dup"');
  });

  it("registers the kernel, inspect, job, crier, storage, zone, production, construction, gathering, trade, diplomacy, settlement, housing, standing-order, status and meta groups", () => {
    expect(verbGroups).toHaveLength(17);
  });
});
