# src/game/api/scenario

The scenario format and runner shared by the e2e tests, the CLI (`--script`) and later phases' acceptance scenarios (plan task 1.10). A scenario is JSON: `{name, seed, options?, steps[]}`. The runner starts a game with `{...options, seed}` and executes the steps in order against a `GameSession`; it is deterministic and stops at the first failure.

- `Scenario.ts` - `scenarioSchema` (Zod), the `Scenario` type and `parseScenario(text)`.
- `runScenario.ts` - `runScenario(scenario, {createSession?, stepTypes?})` returning `{ok:true, stepsRun, tick, finalHash}` or `{ok:false, failure:{stepIndex, message, expected?, actual?}}` (`stepIndex` -1 is the initial new-game). Every step is validated before anything runs.
- `formatScenarioResult.ts` - the `PASS`/`FAIL` text the CLI prints.
- `scenarioStep.ts` - `defineScenarioStep({key, schema, run})`, `StepContext`, `StepFailure`.
- `builtinScenarioSteps.ts` - the built-in step types (below).
- `assertion.ts` - `AssertOp`, `getPathValue` (dotted paths, array indices, `length`), `jsonEquals`, `evaluateAssertion`.

Built-in steps: `{command, atTick?, expectError?}`, `{step: n}`, `{assert: {query, args?, path, op: eq|gt|gte|lt|lte|exists|includes, value?}}`, `{assertHash: {label?, equals?, matches?}}`, `{saveLoad: true}`, `{replay: true}`.

## Adding a step type (later phases)

Define it next to the system that needs it and pass it in; nothing in this folder changes:

```ts
const spawnStep = defineScenarioStep({
  key: "spawnSettler",
  schema: z.object({ spawnSettler: z.number().int() }).strict(), // the WHOLE step object
  run: (step, context) => (context.session.query.run("entities").ok ? null : { message: "boom" }),
});
runScenario(scenario, { stepTypes: [spawnStep] });
```

Most needs are met without a new type: game actions are `command` steps (any registered command kind) and checks are `assert` steps over any registered query. To make a type available to the CLI and the scenario e2e test, append it to `builtinScenarioSteps` in `builtinScenarioSteps.ts`.
