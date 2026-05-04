# Feature Specification: TypeScript Code Style Convention

**Feature Branch**: `023-typescript-code-style`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "I want to specify the code style we'll be using."

## Clarifications

### Session 2026-05-04

- Q: Where does the React renderer live? → A: `src/renderers/react/`; future renderers are siblings under `src/renderers/`.
- Q: Should shared utilities have their own neutral folder? → A: No. Shared utilities live in `src/game/` and renderers import from there.
- Q: How should the engine–renderer dependency boundary be enforced? → A: Both TypeScript project references (compile-time) and a linter rule (dev-time fast feedback).
- Q: Do the style rules apply inside `src/renderers/` too? → A: Yes. The same rules apply to all of `src/`; React-specific conventions (.tsx, PascalCase components) are already compatible.
- Q: Should the spec prescribe the tsconfig layout for project references? → A: No. The spec requires that project references exist; exact file layout is deferred to the implementation plan.
- Q: Spec 022 plan references old paths (`src/engine/`, `src/registries/`, `src/schemas/`, separate `test/`, barrel `index.ts`). Do these need updating? → A: Yes. All paths updated to `src/game/` prefix, barrel files removed, tests co-located. Spec 022 plan amended.
- Q: Entity data model — OOP methods on entities vs pure data? → A: Pure data entities; systems provide functions that operate on entity state. Aligns with constitution principle V (modular systems) and JSON serialization (principle II).
- Q: Spatial positioning — sub-cell continuous coordinates or cell-level only? → A: Cell-level for game logic; sub-cell interpolation for rendering only. Game systems operate on cell indices; the renderer smoothly interpolates movement between cells for visual presentation.
- Q: Event system — string-based hierarchical events or TypeScript discriminated unions? → A: Hybrid — typed event payloads with string-based routing and type guards. Events are routed by string topic but payloads are strongly typed. Type guards narrow the payload at subscription sites.
- Q: Multi-tick task execution — state machines vs async/await? → A: Two-layer model. High-level entity behavior uses `async/await` for readable sequential code (e.g., `await walkTo(target); await craft(recipe)`). Low-level tick systems advance state machines each tick and resolve promises when operations complete. Execution is deterministic because async resolution is driven by tick progression, not real time.
- Q: Should older specs (001–021) be updated to align with spec 023 conventions? → A: Yes. Bulk-update all older specs: fix branch numbers, remove references to old paths/patterns, add "fresh implementation" note. Old implementation was discarded.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Developer writes a new source file (Priority: P1)

A developer on the project creates a new TypeScript source file. Without consulting anyone, they can follow the code style rules independently and produce a file that passes review on first submission.

**Why this priority**: The most frequent touchpoint. Every file ever written depends on getting this right.

**Independent Test**: Create a single new `.ts` file from scratch and verify it passes all automated linting, compiles without errors, and the reviewer accepts it without style-related comments.

**Acceptance Scenarios**:

1. **Given** a developer creates a new `FooBar.ts` exporting a `FooBar` type, **When** they run the linter, **Then** no style violations are reported.
2. **Given** a function is written without a TSDoc block, **When** the linter runs, **Then** it reports a missing documentation violation.
3. **Given** a file uses a default export, **When** the linter runs, **Then** it reports the default export violation.
4. **Given** a file imports from a barrel `index.ts`, **When** the linter runs, **Then** it reports the barrel import violation.

---

### User Story 2 — Developer writes a unit test (Priority: P1)

A developer writes a unit test for a function and places it in the same folder as the source file. The test file naming and structure is consistent with the rest of the codebase.

**Why this priority**: Test co-location is a key structural constraint; getting it wrong causes refactoring debt.

**Independent Test**: Place a `FooBar.test.ts` next to `FooBar.ts`, verify the test runner discovers and executes it, and verify CI does not accept a function without a corresponding test.

**Acceptance Scenarios**:

1. **Given** a function in `src/game/engine/Registry.ts`, **When** a test is added at `src/game/engine/Registry.test.ts`, **Then** the test runner executes it without any configuration change.
2. **Given** a function has no corresponding test, **When** coverage thresholds are enforced, **Then** the build fails.

---

### User Story 3 — Developer creates a new folder (Priority: P2)

A developer adds a new subfolder to `src/`. They add a `README.md` describing the folder's purpose. The README is discovered and referenced in tooling/docs.

**Why this priority**: Folder documentation is a structural rule. Violations accumulate silently but impede onboarding.

**Independent Test**: Add a folder without a README and verify CI reports a violation; add the README and verify the violation clears.

**Acceptance Scenarios**:

1. **Given** a new folder `src/pathfinding/` is created without a `README.md`, **When** the convention check runs, **Then** a violation is reported.
2. **Given** the README is added, **When** the check runs, **Then** no violation.

---

### User Story 4 — LLM/AI agent writes code in this repository (Priority: P1)

An AI coding agent (e.g., GitHub Copilot) generates code. The conventions are explicit enough that the agent can follow them without ambiguity and without being given the full TypeScript handbook.

**Why this priority**: This codebase is AI-assisted. Ambiguous rules produce inconsistent AI output.

**Independent Test**: Pass only this specification to an AI agent and ask it to generate a sample file. Verify the output satisfies all rules without manual correction.

**Acceptance Scenarios**:

1. **Given** only this spec document, **When** the AI generates a function, **Then** the function has TSDoc, a named export, a corresponding test, no `any` types, and follows naming conventions.

---

### Edge Cases

- What happens when a function is purely private (not exported)? → TSDoc and tests are encouraged but NOT required. Only exported symbols are enforced.
- What about `class` vs `interface`? → Classes are permitted. The `type`-over-`interface` rule governs standalone type declarations only; classes are a separate construct.
- How does the short-name rule apply to well-known abbreviations like `id`, `db`, `fs`? → `id` is explicitly permitted. Other short names are a judgement call; unambiguous domain-standard abbreviations are acceptable, but when in doubt, spell it out.
- Does "every function needs a unit test" apply to test helper functions defined inside test files? → No; test-only helpers are exempt.
- What about generated code (e.g., from `zod-to-json-schema`)? → Generated files are exempt; they must be clearly marked with a `// @generated` header comment.

## Requirements _(mandatory)_

### Functional Requirements

#### Exports & Modules

- **FR-001**: Every named export MUST use an explicit named export statement (`export const`, `export type`, `export enum`, `export function`, `export class`). Default exports are PROHIBITED.
- **FR-002**: Barrel files (`index.ts` files that re-export from other modules) are PROHIBITED. Consumers MUST import directly from the file that defines the symbol. Existing barrel files (e.g., `src/game/registries/index.ts`, `src/game/schemas/index.ts`) MUST be deleted and all import sites updated as part of adopting this convention. No grandfathering.
- **FR-003**: Import paths MUST NOT include file extensions. Import ordering is delegated to the code formatter and is out of scope for this convention.

#### Types & Enums

- **FR-004**: `type` aliases MUST be used instead of `interface` for standalone type declarations. `interface` is PROHIBITED except when declaration merging is explicitly required. This rule does not restrict `class` declarations — classes are permitted and appropriate for stateful abstractions. A `class` implicitly defines both a value and a type; that is distinct from an `interface` declaration.
- **FR-005**: `enum` MUST be used instead of string literal unions (`type Foo = 'a' | 'b'`) whenever a set of named constants is intended. String literal unions are PROHIBITED for hand-written application code. Zod schemas MUST use `z.nativeEnum(MyEnum)` rather than `z.enum([...])` to remain consistent with this rule.
- **FR-006**: `any` and `unknown` are PROHIBITED in production source code. Type parameters, explicit narrowing, or `satisfies` MUST be used instead. Exceptions require a `// eslint-disable-next-line` comment with a justification.

#### Naming

- **FR-007**: Symbol names (variables, parameters, type parameters, properties, functions, classes, enums, enum members) SHOULD be at least 3 characters long. Single- and two-character names are discouraged (e.g., prefer `index` over `i`, `error` over `err`). Permitted short names: `id` (primary identity field), and any domain-standard abbreviation that is unambiguous in context. When in doubt, spell it out.
- **FR-008**: Types and classes MUST use `PascalCase`. Functions, variables, parameters, and object properties MUST use `camelCase`. Enum members MUST use `PascalCase`.
- **FR-009**: File names MUST match the primary exported symbol exactly (e.g., a file exporting `ContentLoader` MUST be named `ContentLoader.ts`). Files that export multiple peer symbols MUST be named after the domain they represent (e.g., `materials.ts`).

#### Documentation

- **FR-010**: Every **exported** function, method, type alias, enum, and class MUST have a TSDoc block comment. The opening `/**` MUST appear on its own line, and the description MUST start on the following line. TSDoc on unexported symbols is encouraged but not required.
- **FR-011**: TSDoc blocks MUST NOT be one-liners. The format is:
  ```
  /**
   * Description here.
   */
  ```
- **FR-012**: Non-obvious parameters and return values SHOULD be documented with `@param` and `@returns` tags. Simple getters and trivially named parameters are exempt.

#### Tests

- **FR-013**: Every **exported** function MUST have at least one unit test. The test file MUST be co-located with the source file and named `<SourceFile>.test.ts` (e.g., `Registry.test.ts` next to `Registry.ts`). Tests for unexported functions are encouraged but not required.
- **FR-014**: Test-only helper functions defined inside `.test.ts` files are exempt from the co-location and TSDoc requirements.
- **FR-015**: Generated files (marked with `// @generated` at the top) are exempt from all style rules.

#### Folder Structure

- **FR-016**: Every folder in `src/` MUST contain a `README.md` file that describes the folder's purpose, what it contains, and how it relates to other folders.
- **FR-017**: The top-level source layout MUST follow this structure:
  - `src/game/` — the headless game engine. All simulation logic, registries, schemas, and engine utilities live here.
  - `src/renderers/` — all rendering targets. Each renderer is a subfolder (e.g. `src/renderers/react/`). Future renderers are siblings (e.g. `src/renderers/cli/`).
  - Any utility code needed by both the engine and a renderer MUST live inside `src/game/` and be imported by renderers from there. No additional shared layer exists.
- **FR-018**: The dependency direction is strictly one-way: code in `src/renderers/` MAY import from `src/game/`. Code in `src/game/` MUST NOT import from `src/renderers/` or any of its subfolders. This boundary MUST be enforced by both:
  1. **TypeScript project references** — `src/game/` and `src/renderers/` each have their own `tsconfig.json`; the engine project does not reference the renderers project, making cross-direction imports a compile error.
  2. **A linter rule** (e.g. ESLint `import/no-restricted-paths` or equivalent) — provides fast feedback during development before a full compile.

### Key Entities

- **Source file**: A `.ts` file in `src/` that is not a test file and not generated.
- **Test file**: A `.test.ts` file co-located next to its source file.
- **Barrel file**: An `index.ts` whose sole purpose is re-exporting symbols from other files in the same or sub-directory.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A developer unfamiliar with this project can write a conforming file on their first attempt without consulting anyone beyond reading this spec.
- **SC-002**: An AI coding agent generates conforming code when provided only this spec as context, requiring zero manual style corrections.
- **SC-003**: All existing files in `src/` comply with these rules within one sprint of adoption (zero linter violations reported in CI).
- **SC-004**: Code review time attributable to style discussions drops to zero after adoption.
- **SC-005**: Every folder in `src/` has a README that answers "what is this for?" within 30 seconds of reading.

## Assumptions

- The TypeScript compiler and a linter (ESLint or equivalent) are already configured in the project. This spec describes the rules; wiring them into tooling is a separate implementation task.
- "Every function" means every **exported** function. Private or unexported functions inside a module are encouraged but not required to have tests or TSDoc.
- The codebase targets TypeScript strict mode (`"strict": true`). Rules here are additive to strict mode, not a replacement.
- Code formatter (Prettier or equivalent) handles import ordering, indentation, and whitespace. Those concerns are explicitly out of scope here.
- This spec applies to all code under `src/`, including `src/game/` and `src/renderers/`. Scripts, config files, and generated output remain out of scope.
