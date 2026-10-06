import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function rulesFired(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? "parse-error");
}

const gamePath = "src/game/engine/Fixture.ts";

const documented = (body: string): string => `/**\n * Fixture.\n */\n${body}`;

describe("023 lint rules fire on fixtures", () => {
  it("accepts a conforming file", async () => {
    const code =
      "/**\n * Adds one.\n *\n * @param value - Input.\n * @returns The input plus one.\n */\n" +
      "export function addOne(value: number): number {\n  return value + 1;\n}\n";
    expect(await rulesFired(code, "src/game/engine/addOne.ts")).toEqual([]);
  });

  it("FR-001 default export", async () => {
    const code = documented("export default function Fixture(): number {\n  return 1;\n}\n");
    const fired = await rulesFired(code, gamePath);
    expect(fired).toContain("no-restricted-syntax");
    expect(fired).toContain("no-restricted-exports");
  });

  it("FR-002 barrel re-exports", async () => {
    expect(await rulesFired("export * from './Other';\n", gamePath)).toContain(
      "no-restricted-syntax",
    );
    expect(await rulesFired("export { thing } from './Other';\n", gamePath)).toContain(
      "no-restricted-syntax",
    );
  });

  it("FR-003 file extension in import path, but .json is allowed", async () => {
    expect(await rulesFired("import { thing } from './Other.ts';\nthing();\n", gamePath)).toContain(
      "no-restricted-syntax",
    );
    expect(
      await rulesFired("import data from './data.json';\nexport const loaded = data;\n", gamePath),
    ).not.toContain("no-restricted-syntax");
  });

  it("FR-004 interface instead of type", async () => {
    const code = documented("export interface Fixture {\n  value: number;\n}\n");
    expect(await rulesFired(code, gamePath)).toContain(
      "@typescript-eslint/consistent-type-definitions",
    );
  });

  it("FR-005 string-literal union instead of enum", async () => {
    const code = documented('export type Fixture = "a" | "b";\n');
    expect(await rulesFired(code, gamePath)).toContain("no-restricted-syntax");
  });

  it("FR-005 Zod enum of string literals instead of an enum", async () => {
    const literals = documented(
      'import { z } from "zod";\nexport const fixtureSchema = z.enum(["a", "b"]);\n',
    );
    expect(await rulesFired(literals, gamePath)).toContain("no-restricted-syntax");
    const members = documented(
      'import { z } from "zod";\nexport enum Kind {\n  A = "a",\n}\nexport const fixtureSchema = z.enum([Kind.A]);\nexport const wholeSchema = z.enum(Kind);\n',
    );
    expect(await rulesFired(members, gamePath)).not.toContain("no-restricted-syntax");
  });

  it("FR-006 any and unknown", async () => {
    const anyCode = documented("export type Fixture = { value: any };\n");
    expect(await rulesFired(anyCode, gamePath)).toContain("@typescript-eslint/no-explicit-any");
    const unknownCode = documented("export type Fixture = { value: unknown };\n");
    expect(await rulesFired(unknownCode, gamePath)).toContain("no-restricted-syntax");
  });

  it("FR-006 unknown is allowed with a disable comment that states a reason", async () => {
    const code = documented(
      "// eslint-disable-next-line no-restricted-syntax -- JSON boundary\nexport type Fixture = { value: unknown };\n",
    );
    expect(await rulesFired(code, gamePath)).toEqual([]);
    const bare = documented(
      "// eslint-disable-next-line no-restricted-syntax\nexport type Fixture = { value: unknown };\n",
    );
    expect(await rulesFired(bare, gamePath)).toContain(
      "@eslint-community/eslint-comments/require-description",
    );
  });

  it("FR-007 short identifiers", async () => {
    const code = documented(
      "export function Fixture(): number {\n  const ab = 1;\n  return ab;\n}\n",
    );
    expect(await rulesFired(code, gamePath)).toContain("id-length");
  });

  it("FR-008 naming convention", async () => {
    const typeCode = documented("export type fixture = { value: number };\n");
    expect(await rulesFired(typeCode, gamePath)).toContain("@typescript-eslint/naming-convention");
    const varCode = documented("export const Fixture_Value = 1;\n");
    expect(await rulesFired(varCode, gamePath)).toContain("@typescript-eslint/naming-convention");
  });

  it("FR-010 missing TSDoc on exports", async () => {
    expect(
      await rulesFired("export function Fixture(): number {\n  return 1;\n}\n", gamePath),
    ).toContain("jsdoc/require-jsdoc");
    expect(await rulesFired("export type Fixture = { value: number };\n", gamePath)).toContain(
      "jsdoc/require-jsdoc",
    );
    expect(await rulesFired("export enum Fixture {\n  A = 'a',\n}\n", gamePath)).toContain(
      "jsdoc/require-jsdoc",
    );
  });

  it("FR-012 undocumented parameters and returns", async () => {
    const code =
      "/**\n * Adds one.\n */\nexport function addOne(value: number): number {\n  return value + 1;\n}\n";
    const fired = await rulesFired(code, gamePath);
    expect(fired).toContain("jsdoc/require-param");
    expect(fired).toContain("jsdoc/require-returns");
  });

  it("FR-011 one-line TSDoc", async () => {
    const code = "/** Fixture. */\nexport function Fixture(): number {\n  return 1;\n}\n";
    expect(await rulesFired(code, gamePath)).toContain("jsdoc/multiline-blocks");
  });

  it("FR-014 tests are exempt from TSDoc", async () => {
    const code = "export function helper(): number {\n  return 1;\n}\n";
    expect(await rulesFired(code, "src/game/engine/Fixture.test.ts")).toEqual([]);
  });

  it("FR-015 @generated files are exempt from every rule", async () => {
    const code = "// @generated\nexport default function a(): any {\n  return 1;\n}\n";
    expect(await rulesFired(code, gamePath)).toEqual([]);
  });

  it("FR-018 game must not import renderers", async () => {
    const code = "import { App } from '../../renderers/react/App';\nApp();\n";
    expect(await rulesFired(code, gamePath)).toContain("no-restricted-imports");
  });

  it("the React renderer may import the game api and game types only", async () => {
    const reactPath = "src/renderers/react/Fixture.ts";
    const api = "import { GameSession } from '../../game/api/GameSession';\nnew GameSession();\n";
    expect(await rulesFired(api, reactPath)).toEqual([]);
    const typeOnly =
      "import type { Prng } from '../../game/engine/Prng';\n" +
      documented("export type Rng = Prng;\n");
    expect(await rulesFired(typeOnly, reactPath)).toEqual([]);
    const value = "import { Prng } from '../../game/engine/Prng';\nPrng.create({ seed: 1 });\n";
    expect(await rulesFired(value, reactPath)).toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });
});

describe("determinism bans in src/game (AD11)", () => {
  it("bans Date, Math.random, timers and DOM globals", async () => {
    const cases: [string, string][] = [
      ["Date.now();\n", "no-restricted-globals"],
      ["new Date();\n", "no-restricted-globals"],
      ["Math.random();\n", "no-restricted-properties"],
      ["setTimeout(() => undefined, 1);\n", "no-restricted-globals"],
      ["setInterval(() => undefined, 1);\n", "no-restricted-globals"],
      ["performance.now();\n", "no-restricted-globals"],
      ["document.title = 'x';\n", "no-restricted-globals"],
      ["window.alert('x');\n", "no-restricted-globals"],
    ];
    for (const [code, rule] of cases) {
      expect(await rulesFired(code, gamePath), code).toContain(rule);
    }
  });

  it("allows timers in AutoRunner only", async () => {
    const code = "setTimeout(() => undefined, 1);\n";
    expect(await rulesFired(code, "src/game/engine/AutoRunner.ts")).toEqual([]);
    expect(await rulesFired(code, gamePath)).toContain("no-restricted-globals");
  });

  it("does not restrict renderers", async () => {
    expect(
      await rulesFired("Date.now();\nMath.random();\n", "src/renderers/react/Fixture.ts"),
    ).toEqual([]);
  });
});
