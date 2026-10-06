// ESLint 9 flat config. Implements spec 023 FR-001..FR-018 plus the determinism bans of
// docs/DECISIONS.md (AD11). Rules for src/** are strict; scripts/tests/config get the base set.
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";
import tseslint from "typescript-eslint";

/** FR-015: files whose first line is `// @generated` are exempt from every style rule. */
const generatedProcessor = {
  meta: { name: "skip-generated" },
  preprocess: (text) => (text.startsWith("// @generated") ? [] : [text]),
  postprocess: (messages) => messages.flat(),
  supportsAutofix: false,
};

const srcFiles = ["src/**/*.ts", "src/**/*.tsx"];
const gameFiles = ["src/game/**/*.ts"];
const testFiles = ["**/*.test.ts", "**/*.test.tsx"];

const restrictedSyntax = (extra = []) => [
  "error",
  {
    selector: "ExportAllDeclaration",
    message: "023 FR-002: barrel re-exports are prohibited; import from the defining file.",
  },
  {
    selector: "ExportNamedDeclaration[source]",
    message: "023 FR-002: barrel re-exports are prohibited; import from the defining file.",
  },
  {
    selector: "ExportDefaultDeclaration",
    message: "023 FR-001: default exports are prohibited; use named exports.",
  },
  {
    selector:
      "ImportDeclaration[source.value=/\\.(ts|tsx|js|jsx|mjs|cjs)$/], ExportNamedDeclaration[source.value=/\\.(ts|tsx|js|jsx|mjs|cjs)$/], ImportExpression[source.value=/\\.(ts|tsx|js|jsx|mjs|cjs)$/]",
    message: "023 FR-003: no file extensions in import paths (.json data imports are allowed).",
  },
  {
    selector: "TSUnknownKeyword",
    message:
      "023 FR-006: `unknown` is prohibited. At a documented JSON/Zod/catch boundary use an eslint-disable-next-line comment with a reason.",
  },
  {
    selector: "TSUnionType > TSLiteralType[literal.type='Literal']",
    message: "023 FR-005: use an enum instead of a literal-value union type.",
  },
  ...extra,
];

export default defineConfig(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      ".claude/**",
      ".specify/**",
      ".github/**",
      "specs/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  comments.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Strict 023 conventions for everything under src/.
    files: srcFiles,
    plugins: { jsdoc, skip: { processors: { generated: generatedProcessor } } },
    processor: "skip/generated",
    rules: {
      "no-restricted-syntax": restrictedSyntax(),
      "no-restricted-exports": [
        "error",
        { restrictDefaultExports: { direct: true, named: true, defaultFrom: true } },
      ],
      "id-length": [
        "error",
        {
          min: 3,
          properties: "always",
          // "ok": the `{ ok: true | false }` discriminant of CommandResult/QueryResult (DECISIONS section 3).
          // "op": the comparison key of scenario `assert` steps (DECISIONS D-40).
          exceptions: ["id", "x", "y", "z", "dx", "dy", "ok", "op", "T", "K", "V", "U", "_"],
        },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase"] },
        {
          selector: [
            "variable",
            "function",
            "parameter",
            "classMethod",
            "classProperty",
            "typeProperty",
            "objectLiteralMethod",
            "parameterProperty",
            "accessor",
          ],
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          // DECISIONS D-32: ECS component names are PascalCase map keys (`{ Position: {...} }`).
          selector: "objectLiteralProperty",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: ["objectLiteralProperty", "typeProperty", "objectLiteralMethod"],
          modifiers: ["requiresQuotes"],
          format: null,
        },
      ],
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            MethodDefinition: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
          contexts: ["TSTypeAliasDeclaration", "TSEnumDeclaration"],
          checkConstructors: false,
          checkGetters: false,
          checkSetters: false,
        },
      ],
      "jsdoc/require-description": ["error", { contexts: ["any"] }],
      "jsdoc/multiline-blocks": ["error", { noSingleLineBlocks: true, noZeroLineText: true }],
      "jsdoc/require-param": ["warn", { checkDestructured: false }],
      "jsdoc/require-returns": ["warn", { checkGetters: false }],
    },
  },
  {
    // FR-018 (lint half): the engine must never import a renderer. DOM/clock/random bans keep it
    // deterministic and headless (Constitution I, II).
    files: gameFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/renderers", "**/renderers/**", "@renderers/**"],
              message: "023 FR-018: src/game must not import from src/renderers.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...[
          "Date",
          "setTimeout",
          "setInterval",
          "setImmediate",
          "clearTimeout",
          "clearInterval",
          "clearImmediate",
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "queueMicrotask",
          "performance",
          "window",
          "document",
          "navigator",
          "localStorage",
          "sessionStorage",
          "fetch",
        ].map((name) => ({
          name,
          message: "Determinism/headless: forbidden in src/game (Constitution I, II; AD11).",
        })),
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the seeded Prng (spec 011); Math.random is forbidden in src/game.",
        },
        {
          object: "globalThis",
          property: "Date",
          message: "Time comes from GameTime (spec 001), never the wall clock.",
        },
        {
          object: "Date",
          property: "now",
          message: "Time comes from GameTime (spec 001), never the wall clock.",
        },
        {
          object: "performance",
          property: "now",
          message: "Time comes from GameTime (spec 001), never the wall clock.",
        },
      ],
    },
  },
  {
    // Spec 001: the AutoRunner is the single place in the engine tree allowed to own timers.
    files: ["src/game/engine/AutoRunner.ts"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
  {
    // The CLI renderer is Node-only and may use the engine solely through src/game/api (value
    // imports) plus type-only imports such as JsonValue (plan task 1.10).
    files: ["src/renderers/cli/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "/game/(?!api/)",
              allowTypeImports: true,
              message:
                "The CLI renderer drives the game through src/game/api only (type imports excepted).",
            },
          ],
        },
      ],
    },
  },
  {
    // The React renderer drives the game through src/game/api only (value imports); other
    // src/game modules may be imported for their types (spec 023, spec 024).
    files: ["src/renderers/react/**/*.ts", "src/renderers/react/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "/game/(?!api/)",
              allowTypeImports: true,
              message:
                "The React renderer drives the game through src/game/api only (type imports excepted).",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests of the React renderer may build sessions and engines directly.
    files: ["src/renderers/react/**/*.test.ts", "src/renderers/react/**/*.test.tsx"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },
  {
    // Tests of the CLI may build sessions and engines directly.
    files: ["src/renderers/cli/**/*.test.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },
  {
    // The renderers are the only place with DOM globals and React component naming.
    files: ["src/renderers/**/*.tsx"],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase"] },
        {
          selector: ["variable", "function"],
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: [
            "parameter",
            "classMethod",
            "classProperty",
            "typeProperty",
            "objectLiteralProperty",
            "objectLiteralMethod",
            "parameterProperty",
            "accessor",
          ],
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: ["objectLiteralProperty", "typeProperty", "objectLiteralMethod"],
          modifiers: ["requiresQuotes"],
          format: null,
        },
      ],
    },
  },
  {
    // FR-014: test helpers are exempt from TSDoc.
    files: testFiles,
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-description": "off",
      "jsdoc/multiline-blocks": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
    },
  },
);
