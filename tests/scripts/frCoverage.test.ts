import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeCoverage,
  mentionsIn,
  renderReport,
  specsNamedIn,
  specsOfPath,
} from "../../scripts/lib/frCoverage";

// Task 7.1 groundwork of 7.2: the scan that maps FR/SC ids named in tests onto the specs.

const known = new Set(["005", "018", "021"]);
const roots: string[] = [];

function makeRepository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fr-coverage-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("fr-coverage", () => {
  it("finds the spec of a folder, longest folder first", () => {
    expect(specsOfPath("src/game/storage/haulDeliver.test.ts")).toEqual(["018"]);
    expect(specsOfPath("tests/scripts/x.test.ts")).toEqual(["023"]);
    expect(specsOfPath("docs/x.test.ts")).toEqual([]);
  });

  it("finds spec numbers named in a text", () => {
    expect(
      specsNamedIn("// Spec 018 FR-004 and specs/021-diplomacy, 005 SC-001, 999 FR-001", known),
    ).toEqual(["018", "021", "005"]);
  });

  it("credits an id to the spec on its line, else to the file's specs, else to the folder", () => {
    const text = [
      "// Spec 018 covers storage",
      'it("a (FR-004)", () => {});',
      'it("b (spec 021 FR-009)", () => {});',
      "// @covers 005:FR-001",
    ].join("\n");
    expect(mentionsIn("tests/x.test.ts", text, known)).toEqual([
      { id: "FR-004", specs: ["018", "021", "005"] },
      { id: "FR-009", specs: ["021"] },
      { id: "FR-001", specs: ["005"] },
    ]);
    expect(mentionsIn("src/game/zones/a.test.ts", 'it("c (FR-002)")', known)).toEqual([
      { id: "FR-002", specs: ["015"] },
    ]);
  });

  it("computes the coverage per spec and renders the uncovered requirements", () => {
    const root = makeRepository({
      "specs/018-stockpiles/spec.md":
        "- **FR-001**: First thing\n- **FR-002**: Second thing\n- **SC-001**: A budget\n",
      "specs/021-diplomacy/spec.md": "- **FR-001**: Gift\n",
      "src/game/storage/haul.test.ts": 'it("moves goods (FR-001, SC-001)", () => {});\n',
      "tests/diplomacy.test.ts": "// spec 021 FR-001\n",
    });
    const coverage = computeCoverage(root);
    expect(coverage.map((entry) => [entry.spec, entry.total, entry.covered])).toEqual([
      ["018", 3, 2],
      ["021", 1, 1],
    ]);
    const report = renderReport(coverage);
    expect(report).toContain("**3 of 4**");
    expect(report).toContain("- FR-002: Second thing");
    expect(report).not.toContain("### 021");
  });
});
