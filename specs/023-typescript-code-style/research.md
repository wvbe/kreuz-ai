# Research: TypeScript Code Style Tooling

**Spec**: 023-typescript-code-style | **Date**: 2026-05-04 | **Status**: Complete

---

## 1. ESLint 9 Flat Config with TypeScript

### Decision

Use ESLint 9 flat config (`eslint.config.ts`) with `typescript-eslint` v8+ using `parserOptions.projectService: true` for typed linting. Use `eslint-plugin-import-x` (the maintained fork) for `no-restricted-paths` to enforce the engine→renderer boundary.

### Rationale

- **Flat config** is the only format ESLint recommends going forward; legacy `.eslintrc` is deprecated.
- **`projectService: true`** (new in typescript-eslint v8) eliminates manual `parserOptions.project` path configuration for monorepos entirely. It uses TypeScript's own project service to resolve type information per-file automatically — no globs, no `tsconfig.eslint.json` hacks.
- **`eslint-plugin-import-x`** is the actively maintained ESM-native fork of `eslint-plugin-import`. It supports ESLint 9 flat config natively and includes the `no-restricted-paths` rule unchanged.

### Alternatives Considered

| Alternative                                         | Why Rejected                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `parserOptions.project` with glob paths             | Requires manual path management; `projectService` is zero-config for monorepos                                     |
| `eslint-plugin-import` (original)                   | Stale maintenance; poor ESLint 9 flat config support; `eslint-plugin-import-x` is the community-endorsed successor |
| `@typescript-eslint/no-restricted-imports`          | Only restricts import specifiers (package names), not file paths/directories                                       |
| Boundary enforcement via `eslint-plugin-boundaries` | Heavier abstraction; `no-restricted-paths` is simpler and sufficient for a two-project boundary                    |

### Key Configuration Pattern

```typescript
// eslint.config.ts
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig(
    globalIgnores(["dist/", "node_modules/", "coverage/"]),

    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,

    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
    },

    // Engine→renderer boundary enforcement
    {
        files: ["src/game/**/*.ts"],
        plugins: { "import-x": importX },
        rules: {
            "import-x/no-restricted-paths": [
                "error",
                {
                    zones: [
                        {
                            target: "./src/game",
                            from: "./src/renderers",
                            message:
                                "Engine MUST NOT import from renderers (Constitution I).",
                        },
                    ],
                },
            ],
        },
    },

    eslintConfigPrettier,
);
```

### Notes

- ESLint 9 requires `jiti` (>=2.2.0) as a devDependency to load `.ts` config files on Node.js <22.13.
- The `defineConfig()` helper provides type safety for the config array.
- `tseslint.configs.strictTypeChecked` includes rules like `no-explicit-any`, `no-unsafe-*`, and strict type-checked variants.

---

## 2. TypeScript Project References for Monorepo

### Decision

Use a three-layer tsconfig structure: `tsconfig.base.json` (shared options) → per-project `tsconfig.json` files (engine, renderer) → root `tsconfig.json` (solution file with `references`). Use relative imports between files within the same project. The renderer references the engine project via `references`.

### Rationale

- **`composite: true`** on each sub-project enables incremental builds and enforces that all files are included. The engine project's `.d.ts` output is what the renderer sees, making cross-boundary violations a compile error.
- **Solution-style root tsconfig** (empty `files: []` + `references`) gives a single entry point for `tsc -b` to build everything in dependency order.
- **Relative imports** (not `paths` aliases) are simpler, require no extra build tooling, work with `NodeNext` module resolution, and make dependency direction visible in the import path.

### Alternatives Considered

| Alternative                                           | Why Rejected                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `paths` aliases (e.g., `@game/*`)                     | Requires runtime path mapping (e.g., `tsconfig-paths`), breaks NodeNext resolution, adds bundler coupling |
| Single `tsconfig.json` with `include` globs           | No compile-time boundary enforcement; no incremental build benefits                                       |
| Separate npm packages (true monorepo with workspaces) | Overkill for two tightly-coupled projects in a single repo; adds package management overhead              |

### Key Configuration Pattern

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true
  }
}

// src/game/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": ".",
    "outDir": "../../dist/game"
  },
  "include": ["**/*.ts"],
  "exclude": ["**/*.test.ts"]
}

// src/renderers/react/tsconfig.json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": ".",
    "outDir": "../../../dist/renderers/react",
    "jsx": "react-jsx"
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx"],
  "references": [
    { "path": "../../game" }
  ]
}

// tsconfig.json (root solution)
{
  "files": [],
  "references": [
    { "path": "src/game" },
    { "path": "src/renderers/react" }
  ]
}
```

### Notes

- `declarationMap: true` enables "Go to Definition" to navigate across project boundaries transparently.
- `noEmit: true` in the base config means builds are type-check-only by default; bundling is handled separately.
- `verbatimModuleSyntax: true` enforces explicit `import type` for type-only imports, improving tree-shaking and clarity.

---

## 3. Vitest Configuration for Multi-Project

### Decision

Use a single root `vitest.config.ts` with inline `projects` array (Vitest 3.2+ syntax, replacing the deprecated `workspace` key). Each project uses `extends: true` to inherit shared config. Coverage is configured globally (root-level only). Use `v8` coverage provider.

### Rationale

- **`projects` replaces `workspace`** as of Vitest 3.2. The old `vitest.workspace.ts` file is deprecated.
- **Inline project definitions** with `extends: true` keep all configuration in one file, reducing indirection. Each project just specifies its `include` pattern and `name`.
- **Coverage is root-level only** — Vitest does not support per-project coverage thresholds. A single `coverage.thresholds` config applies to all files matched by `coverage.include`.
- **v8 provider** is recommended: faster, lower memory, and since Vitest 3.2 its accuracy matches Istanbul via AST-aware remapping.

### Alternatives Considered

| Alternative                             | Why Rejected                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `vitest.workspace.ts` file              | Deprecated in Vitest 3.2; replaced by `projects` in root config                      |
| Separate `vitest.config.ts` per project | Unnecessary complexity for two projects; root config with inline projects is cleaner |
| Istanbul provider                       | Slower, higher memory; v8 now has equivalent accuracy                                |
| Per-project coverage thresholds         | Not supported by Vitest; coverage config is root-level only                          |

### Key Configuration Pattern

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "game",
                    include: ["src/game/**/*.test.ts"],
                    environment: "node",
                },
            },
            {
                extends: true,
                test: {
                    name: "react",
                    include: ["src/renderers/react/**/*.test.{ts,tsx}"],
                    environment: "jsdom",
                },
            },
        ],
        coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "**/README.md"],
            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80,
            },
            reporter: ["text", "html", "lcov"],
        },
    },
});
```

### Notes

- Co-located tests (`Foo.test.ts` next to `Foo.ts`) are discovered by the `include` glob — no configuration change needed when adding tests.
- The `--project game` CLI flag runs only the engine tests; useful for fast feedback loops.
- `environment: 'jsdom'` is only needed for the React project (DOM APIs); the engine project uses `'node'`.

---

## 4. No-Barrel-File Enforcement

### Decision

Use `eslint-plugin-barrel-files` with the `avoid-barrel-files` and `avoid-re-export-all` rules. Supplement with `import-x/no-restricted-paths` targeting `**/index.ts` if stricter enforcement is needed.

### Rationale

- **`eslint-plugin-barrel-files`** is purpose-built, lightweight (181 stars, ESM, flat config support since 2024), and provides exactly the rules needed:
    - `avoid-barrel-files`: flags any file that only contains re-exports
    - `avoid-re-export-all`: flags `export * from` patterns
    - `avoid-importing-barrel-files`: flags imports that resolve to barrel files
- The plugin handles edge cases (mixed exports, partial barrels) that a simple filename-based rule would miss.

### Alternatives Considered

| Alternative                                        | Why Rejected                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Custom ESLint rule checking filenames              | Only catches `index.ts` by name; misses barrel patterns in non-index files; maintenance burden |
| `no-restricted-imports` with `index` pattern       | Only blocks importing barrels, doesn't prevent creating them                                   |
| `eslint-plugin-import-x/no-cycle` + manual review  | Doesn't prevent barrels specifically; only detects circular dependencies                       |
| Filename convention ban via `no-restricted-syntax` | Cannot analyze re-export patterns; too coarse                                                  |

### Key Configuration Pattern

```typescript
// In eslint.config.ts
import barrelFiles from 'eslint-plugin-barrel-files';

// Add to config array:
{
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  plugins: { 'barrel-files': barrelFiles },
  rules: {
    'barrel-files/avoid-barrel-files': 'error',
    'barrel-files/avoid-re-export-all': 'error',
    'barrel-files/avoid-importing-barrel-files': 'error',
  },
}
```

### Notes

- The plugin migrated to ESM and flat config in 2024. Ensure version >=2.0.0.
- Existing barrel files (`src/game/registries/index.ts`, etc.) must be deleted as part of adoption (per FR-002).

---

## 5. TSDoc Enforcement via ESLint

### Decision

Use `eslint-plugin-jsdoc` with the `flat/recommended-tsdoc-error` preset. This provides `require-jsdoc` (enforces presence on exported symbols), `multiline-blocks` (enforces multi-line format), and `require-param`/`require-returns` (enforces tag presence). Supplement with `eslint-plugin-tsdoc` for TSDoc syntax validation.

### Rationale

- **`eslint-plugin-jsdoc`** (1.2k stars, v62+, actively maintained) is far more capable than `eslint-plugin-tsdoc` alone:
    - `require-jsdoc` supports `publicOnly: true` to enforce only on exported symbols
    - `multiline-blocks` enforces the multi-line `/** ... */` format (FR-011)
    - `require-param`, `require-returns` enforce tag presence
    - `require-description` ensures descriptions aren't empty
    - TypeScript-aware: understands types from TS so it doesn't demand `@type` annotations
    - Has a dedicated `flat/recommended-tsdoc` config for TSDoc-compatible projects
- **`eslint-plugin-tsdoc`** adds TSDoc-specific syntax validation (tag names, modifiers) that `eslint-plugin-jsdoc` doesn't cover. They complement each other.

### Alternatives Considered

| Alternative                                        | Why Rejected                                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint-plugin-tsdoc` alone                        | Only validates syntax of existing comments; cannot enforce that comments exist, enforce multi-line format, or require `@param`/`@returns` |
| `eslint-plugin-jsdoc` alone (without tsdoc plugin) | Doesn't validate TSDoc-specific syntax (e.g., `{@link}`, `@remarks`); combining both gives full coverage                                  |
| TypeDoc `--validation` flag                        | Build-time only; no IDE feedback; doesn't enforce presence                                                                                |
| Custom ESLint rule                                 | Reinventing the wheel; `eslint-plugin-jsdoc` already handles all cases                                                                    |

### Key Configuration Pattern

```typescript
// In eslint.config.ts
import jsdoc from 'eslint-plugin-jsdoc';
import tsdocPlugin from 'eslint-plugin-tsdoc';

// TSDoc syntax validation
{
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  plugins: { tsdoc: tsdocPlugin },
  rules: {
    'tsdoc/syntax': 'error',
  },
},

// JSDoc presence and format enforcement
jsdoc.configs['flat/recommended-tsdoc-error'],
{
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  rules: {
    // Enforce JSDoc on exports only
    'jsdoc/require-jsdoc': ['error', {
      publicOnly: true,
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
      },
      contexts: [
        'TSTypeAliasDeclaration',
        'TSEnumDeclaration',
        'TSInterfaceDeclaration',
      ],
    }],
    // Enforce multi-line format (no single-line /** ... */)
    'jsdoc/multiline-blocks': ['error', {
      noSingleLineBothSides: true,
    }],
    // Enforce @param and @returns
    'jsdoc/require-param': 'error',
    'jsdoc/require-param-description': 'error',
    'jsdoc/require-returns': 'error',
    'jsdoc/require-returns-description': 'error',
    // No types in TSDoc (TypeScript provides them)
    'jsdoc/no-types': 'error',
    'jsdoc/require-description': 'error',
  },
},

// Exempt test files from JSDoc requirements
{
  files: ['**/*.test.ts', '**/*.test.tsx'],
  rules: {
    'jsdoc/require-jsdoc': 'off',
  },
}
```

### Notes

- `publicOnly: true` means only exported symbols trigger the rule (matching FR-010).
- The `flat/recommended-tsdoc` config turns off `require-param-type` and `require-returns-type` since TypeScript provides the types.
- `contexts` array adds enforcement for type aliases, enums, and interfaces beyond just functions and classes.
- Test files are exempted from JSDoc requirements (FR-014).

---

## 6. Folder README Enforcement

### Decision

Use a standalone shell script (`scripts/check-folder-readmes.sh`) run as a CI step and available as a pre-commit hook. Not an ESLint rule.

### Rationale

- ESLint operates on file contents, not filesystem structure. Checking "does this folder have a README?" is a filesystem query, not a lint-on-file operation.
- A shell script is trivially simple (~10 lines), has zero dependencies, runs in <1s, and integrates naturally with CI and git hooks.
- Custom ESLint rules add maintenance burden for a check that doesn't benefit from AST analysis.

### Alternatives Considered

| Alternative                             | Why Rejected                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom ESLint rule                      | ESLint visits files, not directories; would need to synthesize a "virtual file" per directory; over-engineered                                    |
| `eslint-plugin-folder-rules` or similar | No mature plugin exists for this specific check                                                                                                   |
| Husky + lint-staged                     | lint-staged only processes changed files; wouldn't catch a new folder added without a README unless the hook script explicitly checks all folders |
| `danger.js` CI check                    | Adds heavy dependency for a trivial check                                                                                                         |

### Key Configuration Pattern

```bash
#!/usr/bin/env bash
# scripts/check-folder-readmes.sh
set -euo pipefail

errors=0
while IFS= read -r -d '' dir; do
  if [[ ! -f "$dir/README.md" ]]; then
    echo "ERROR: Missing README.md in $dir"
    errors=$((errors + 1))
  fi
done < <(find src -type d -print0)

if [[ $errors -gt 0 ]]; then
  echo "Found $errors folder(s) without README.md"
  exit 1
fi

echo "All folders have README.md ✓"
```

```jsonc
// package.json
{
    "scripts": {
        "check:readmes": "bash scripts/check-folder-readmes.sh",
    },
}
```

### Notes

- Runs as part of the CI pipeline alongside `lint` and `typecheck`.
- Can be added as a pre-commit hook via `lefthook` or `husky` for local fast feedback.
- The script is simple enough that an AI agent or developer can understand and maintain it without documentation.

---

## 7. Prettier + ESLint Integration (2025+)

### Decision

Use `eslint-config-prettier/flat` as the **last** item in the ESLint flat config array. Run Prettier and ESLint as separate commands (`prettier --write` and `eslint --fix`). Do NOT use `eslint-plugin-prettier`.

### Rationale

- **`eslint-config-prettier`** (v10.x, 5.9k stars) remains the standard approach in 2025+. It disables all ESLint rules that conflict with Prettier, including rules from `@typescript-eslint` and other plugins automatically.
- The flat config approach is identical in concept: place `eslint-config-prettier/flat` last in the array so it overrides any conflicting rules from earlier configs.
- **Separate commands** (not `eslint-plugin-prettier`) is the recommended approach because:
    - Faster: no re-formatting on every lint pass
    - Cleaner error output: Prettier errors don't pollute ESLint results
    - No red squiggles for formatting issues in the editor
    - `eslint-plugin-prettier` is acknowledged as legacy by Prettier maintainers

### Alternatives Considered

| Alternative                                                    | Why Rejected                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `eslint-plugin-prettier` (run Prettier as an ESLint rule)      | Slower; conflates formatting with linting; deprecated pattern; causes confusing `--fix` interactions                       |
| No `eslint-config-prettier` (manually avoid conflicting rules) | Fragile; easy to accidentally enable a conflicting rule from a shared config                                               |
| `@stylistic/eslint-plugin` replacing Prettier                  | Requires migrating all formatting rules; Prettier is simpler and more widely adopted                                       |
| Biome (replaces both ESLint and Prettier)                      | Not yet mature for TypeScript project references; lacks the plugin ecosystem needed (import-x, jsdoc, barrel-files, tsdoc) |

### Key Configuration Pattern

```typescript
// eslint.config.ts — last entry in the array
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig(
    // ... all other configs ...
    eslintConfigPrettier, // Must be last to override conflicting rules
);
```

```jsonc
// package.json scripts
{
    "scripts": {
        "format": "prettier --write .",
        "format:check": "prettier --check .",
        "lint": "eslint .",
        "lint:fix": "eslint --fix .",
    },
}
```

```javascript
// prettier.config.js
export default {
    semi: true,
    singleQuote: true,
    trailingComma: "all",
    printWidth: 100,
    tabWidth: 2,
};
```

### Notes

- The `/flat` import adds a `name` property to the config object for better config inspector experience.
- CI runs `format:check` and `lint` as separate steps; both must pass.
- Developers can run `format` + `lint:fix` locally to auto-fix everything.
- IDE setup: enable "format on save" with Prettier extension; ESLint extension provides real-time lint feedback.

---

## Summary of Chosen Stack

| Concern                | Tool                          | Version |
| ---------------------- | ----------------------------- | ------- |
| Linting                | ESLint 9 (flat config)        | ^9.x    |
| TypeScript linting     | `typescript-eslint`           | ^8.x    |
| Import boundary        | `eslint-plugin-import-x`      | ^4.x    |
| Barrel file prevention | `eslint-plugin-barrel-files`  | ^2.x    |
| TSDoc syntax           | `eslint-plugin-tsdoc`         | ^0.4.x  |
| JSDoc enforcement      | `eslint-plugin-jsdoc`         | ^62.x   |
| Formatting             | Prettier                      | ^3.x    |
| Format/lint compat     | `eslint-config-prettier`      | ^10.x   |
| Testing                | Vitest                        | ^3.2+   |
| Coverage               | `@vitest/coverage-v8`         | ^3.2+   |
| Type checking          | TypeScript project references | ^5.x    |
| Folder READMEs         | Shell script                  | N/A     |

All tools are dev-time only — zero runtime overhead as required by the spec.
