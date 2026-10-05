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
        "jobs",
        "stock",
        "zones",
        "zone",
        "orders",
        "order",
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

  it("registers the kernel, inspect, job, storage, zone, production, construction and meta groups", () => {
    expect(verbGroups).toHaveLength(8);
  });
});
