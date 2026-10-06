import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkConventions } from "../../scripts/lib/conventions";
import { findMissingReadmes } from "../../scripts/lib/readmes";

// Spec 023 requirements that hold of the repository itself: the layout of src/, the project
// references that keep the engine independent of the renderers, and the checks that CI runs.

const root = join(__dirname, "..", "..");
const source = join(root, "src");

function folders(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(full, ...folders(full));
    }
  }
  return found;
}

describe("spec 023 repository layout and checks", () => {
  // @covers 023:FR-017
  it("has only src/game and src/renderers (with one folder per renderer) at the top of src", () => {
    const entries = readdirSync(source).sort();
    expect(entries).toEqual(["README.md", "game", "renderers"]);
    const renderers = readdirSync(join(source, "renderers"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(renderers).toEqual(expect.arrayContaining(["cli", "react"]));
    expect(existsSync(join(source, "shared"))).toBe(false);
  });

  // @covers 023:FR-018
  it("keeps the engine project free of references to the renderers project", () => {
    const game = readFileSync(join(source, "game", "tsconfig.json"), "utf8");
    expect(game).not.toContain("references");
    expect(game).not.toContain("renderers");
    const renderers = readFileSync(join(source, "renderers", "tsconfig.json"), "utf8");
    expect(renderers).toContain('"path": "../game"');
  });

  // @covers 023:FR-016 023:SC-004
  it("gives every folder of src a README that says what the folder is for", () => {
    expect(findMissingReadmes(source)).toEqual([]);
    for (const folder of [source, ...folders(source)]) {
      const text = readFileSync(join(folder, "README.md"), "utf8");
      // a 30 second read: a heading and a description, not an empty placeholder
      expect(text.trim().length, folder).toBeGreaterThan(40);
      expect(text, folder).toMatch(/^# /m);
    }
  });

  // @covers 023:FR-009 023:FR-013 023:SC-003
  it("has no convention violation in src: file names, co-located tests, no barrels", () => {
    expect(checkConventions(source)).toEqual([]);
  });

  // @covers 023:SC-001 023:SC-002
  it("runs the linter without warnings, the readme and convention checks and the tests in CI", () => {
    const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
    expect(scripts.lint).toContain("--max-warnings 0");
    for (const step of ["lint", "check:readmes", "check:conventions", "typecheck"]) {
      expect(scripts.ci, step).toContain(`npm run ${step}`);
    }
  });
});
