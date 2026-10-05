import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkConventions, listExports } from "../../scripts/lib/conventions";
import { findMissingReadmes } from "../../scripts/lib/readmes";

const created: string[] = [];

function makeSrc(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), "kv-check-"));
  created.push(base);
  const root = join(base, "src");
  mkdirSync(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("findMissingReadmes", () => {
  it("passes when every folder has a README and fails for a folder without one", () => {
    const ok = makeSrc({ "README.md": "x", "a/README.md": "x", "a/b/README.md": "x" });
    expect(findMissingReadmes(ok)).toEqual([]);
    const bad = makeSrc({ "README.md": "x", "a/README.md": "x", "a/b/Foo.ts": "" });
    expect(findMissingReadmes(bad)).toEqual([join("src", "a", "b")]);
  });

  it("reports the root itself when it has no README", () => {
    expect(findMissingReadmes(makeSrc({ "a/README.md": "x" }))).toContain("src");
  });
});

describe("listExports", () => {
  it("classifies functions, classes, arrow consts, types and export lists", () => {
    const { symbols, reExports } = listExports(
      [
        "export function fn() {}",
        "export class Cls {}",
        "export const arrow = () => 1;",
        "export const data = 5;",
        "export type Shape = { a: number };",
        "export enum Kind { A = 'a' }",
        "function local() {}",
        "export { local as renamed };",
        "export { thing } from './other';",
      ].join("\n"),
      "x.ts",
    );
    expect(symbols).toEqual([
      { name: "fn", isFunction: true },
      { name: "Cls", isFunction: true },
      { name: "arrow", isFunction: true },
      { name: "data", isFunction: false },
      { name: "Shape", isFunction: false },
      { name: "Kind", isFunction: false },
      { name: "renamed", isFunction: true },
    ]);
    expect(reExports).toEqual(["./other"]);
  });
});

describe("checkConventions", () => {
  it("accepts a well-formed file with a co-located test", () => {
    const root = makeSrc({
      "Foo.ts": "export function Foo() {}",
      "Foo.test.ts": "import { Foo } from './Foo'; Foo();",
      "Shape.ts": "export type Shape = { b: number };",
      "@gen.ts": "// @generated\nexport default 1;",
    });
    expect(checkConventions(root)).toEqual([]);
  });

  it("flags barrels, re-exports, name mismatch, missing and incomplete tests, orphan tests", () => {
    const root = makeSrc({
      "index.ts": "export const a = 1;",
      "reexport.ts": "export { a } from './index';",
      "Wrong.ts": "export function Other() {}",
      "Wrong.test.ts": "Other();",
      "NoTest.ts": "export function NoTest() {}",
      "Partial.ts": "export function Partial() {}\nexport function second() {}",
      "Partial.test.ts": "Partial();",
      "Multi.tsx": "export const alpha = () => 1;\nexport const beta = () => 2;",
      "Multi.test.ts": "alpha(); beta();",
      "Orphan.test.ts": "",
    });
    const messages = checkConventions(root).map((entry) => entry.message);
    expect(messages.some((text) => text.includes("barrel files"))).toBe(true);
    expect(messages.some((text) => text.includes("re-export from"))).toBe(true);
    expect(messages.some((text) => text.includes('only export "Other"'))).toBe(true);
    expect(messages.some((text) => text.includes("missing co-located test NoTest"))).toBe(true);
    expect(messages.some((text) => text.includes('"second" is not referenced'))).toBe(true);
    expect(messages.some((text) => text.includes('PascalCase file name "Multi"'))).toBe(true);
    expect(messages.some((text) => text.includes("test has no source file Orphan"))).toBe(true);
  });
});
