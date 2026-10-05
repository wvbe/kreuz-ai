import { z } from "zod";
import { jsonValueSchema } from "../../ecs/jsonData";
import { maxStepTicks } from "../Command";
import type { CommandResult } from "../CommandResult";
import { AssertOp, evaluateAssertion, getPathValue } from "./assertion";
import { debugSpawnCommandKind } from "./createDebugSpawnSystem";
import { defineScenarioStep } from "./scenarioStep";
import type { ScenarioStepType, StepContext, StepFailure } from "./scenarioStep";

const argsSchema = z.record(z.string(), jsonValueSchema);

function describeFailure(result: CommandResult): string {
  return result.ok ? "ok" : `${result.error.kind}: ${result.error.message}`;
}

function advanceTo(context: StepContext, atTick: number): StepFailure | null {
  const current = context.session.tick;
  if (current > atTick) {
    return {
      message: `the session is already past tick ${atTick}`,
      expected: atTick,
      actual: current,
    };
  }
  if (current < atTick) {
    const advanced = context.session.step(atTick - current);
    if (!advanced.ok) {
      return { message: `could not advance to tick ${atTick}: ${describeFailure(advanced)}` };
    }
  }
  if (context.session.tick !== atTick) {
    return {
      message: `could not reach tick ${atTick} (is the clock paused?)`,
      expected: atTick,
      actual: context.session.tick,
    };
  }
  return null;
}

/**
 * `{command, atTick?, expectError?}`: dispatches a command, optionally after advancing to a tick,
 * and fails if its result is not as expected.
 */
const commandStep = defineScenarioStep({
  key: "command",
  schema: z
    .object({
      command: z.looseObject({ kind: z.string().min(1) }),
      atTick: z.number().int().min(0).optional(),
      expectError: z.string().min(1).optional(),
    })
    .strict(),
  run: (step, context) => {
    if (step.atTick !== undefined) {
      const late = advanceTo(context, step.atTick);
      if (late !== null) {
        return late;
      }
    }
    const result = context.session.dispatch(step.command);
    if (step.expectError !== undefined) {
      if (result.ok) {
        return {
          message: `command "${step.command.kind}" should have failed with ${step.expectError}`,
          expected: step.expectError,
          actual: "ok",
        };
      }
      return result.error.kind === step.expectError
        ? null
        : {
            message: `command "${step.command.kind}" failed with the wrong error: ${describeFailure(result)}`,
            expected: step.expectError,
            actual: result.error.kind,
          };
    }
    return result.ok
      ? null
      : { message: `command "${step.command.kind}" failed: ${describeFailure(result)}` };
  },
});

/**
 * `{step: n}`: runs n ticks.
 */
const stepStep = defineScenarioStep({
  key: "step",
  schema: z.object({ step: z.number().int().min(1).max(maxStepTicks) }).strict(),
  run: (step, context) => {
    const result = context.session.step(step.step);
    return result.ok ? null : { message: `step failed: ${describeFailure(result)}` };
  },
});

/**
 * `{assert: {query, args?, path, op, value?}}`: runs a query and compares one value in its result.
 */
const assertStep = defineScenarioStep({
  key: "assert",
  schema: z
    .object({
      assert: z
        .object({
          query: z.string().min(1),
          args: argsSchema.optional(),
          path: z.string(),
          op: z.enum(AssertOp),
          value: jsonValueSchema.optional(),
        })
        .strict()
        .refine((assertion) => assertion.op === AssertOp.Exists || assertion.value !== undefined, {
          message: 'operator needs a "value"',
          path: ["value"],
        }),
    })
    .strict(),
  run: (step, context) => {
    const { query, args, path, op, value } = step.assert;
    const result = context.session.query.run(query, args ?? {});
    if (!result.ok) {
      return { message: `query "${query}" failed: ${result.error.kind}: ${result.error.message}` };
    }
    const lookup = getPathValue(result.data, path);
    if (evaluateAssertion(op, lookup, value)) {
      return null;
    }
    const where = `${query}${path === "" ? "" : `.${path}`}`;
    return {
      message: `assertion failed: ${where} ${op}${value === undefined ? "" : ` ${JSON.stringify(value)}`}${lookup.found ? "" : " (path not found)"}`,
      ...(value === undefined ? {} : { expected: value }),
      actual: lookup.found ? lookup.value : null,
    };
  },
});

/**
 * `{assertHash: {label?, equals?, matches?}}`: checks the state hash against a literal and/or a
 * hash recorded earlier under a label, and records it under `label`.
 */
const assertHashStep = defineScenarioStep({
  key: "assertHash",
  schema: z
    .object({
      assertHash: z
        .object({
          label: z.string().min(1).optional(),
          equals: z.string().min(1).optional(),
          matches: z.string().min(1).optional(),
        })
        .strict(),
    })
    .strict(),
  run: (step, context) => {
    const { label, equals, matches } = step.assertHash;
    const hash = context.session.stateHash();
    if (equals !== undefined && hash !== equals) {
      return { message: "state hash differs from the literal", expected: equals, actual: hash };
    }
    if (matches !== undefined) {
      const earlier = context.hashes.get(matches);
      if (earlier === undefined) {
        return { message: `no state hash was recorded under label "${matches}"` };
      }
      if (earlier !== hash) {
        return {
          message: `state hash differs from the one labelled "${matches}"`,
          expected: earlier,
          actual: hash,
        };
      }
    }
    if (label !== undefined) {
      context.hashes.set(label, hash);
    }
    return null;
  },
});

/**
 * `{saveLoad: true}`: saves, loads the save back and requires an identical state hash.
 */
const saveLoadStep = defineScenarioStep({
  key: "saveLoad",
  schema: z.object({ saveLoad: z.literal(true) }).strict(),
  run: (_step, context) => {
    const saved = context.session.save();
    if (!saved.ok || typeof saved.data !== "string") {
      return { message: `save failed: ${describeFailure(saved)}` };
    }
    // Taken after the save command: every accepted command, including save-game and load-game,
    // consumes one command id (D-39), and the counter is part of the hash.
    const before = context.session.stateHash();
    const loaded = context.session.load(saved.data);
    if (!loaded.ok) {
      return { message: `load failed: ${describeFailure(loaded)}` };
    }
    const after = context.session.stateHash();
    return after === before
      ? null
      : { message: "state hash changed across save and load", expected: before, actual: after };
  },
});

/**
 * `{replay: true}`: replays the session's command log into a fresh session and requires the same
 * state hash.
 */
const replayStep = defineScenarioStep({
  key: "replay",
  schema: z.object({ replay: z.literal(true) }).strict(),
  run: (_step, context) => {
    const expectedHash = context.session.stateHash();
    const replayed = context.createSession().replay(context.session.commandLog, { expectedHash });
    return replayed.ok
      ? null
      : {
          message: `replay of the command log failed at entry ${replayed.index}: ${replayed.error.kind}: ${replayed.error.message}`,
          expected: expectedHash,
        };
  },
});

/**
 * `{debugSpawn: {prototypeId, mapId, cells[], overrides?, inventory?}}`: spawns one entity of a
 * prototype on every listed cell, with component overrides and starting items (queued like a
 * command, so it is applied by the next tick and replays). **Scenario and test use only**: it
 * needs the command `DebugSpawn`, which only `createScenarioSession` registers, so against a real
 * game session the step fails with an unknown command.
 */
const debugSpawnStep = defineScenarioStep({
  key: "debugSpawn",
  schema: z
    .object({
      debugSpawn: z
        .object({
          prototypeId: z.string().min(1),
          mapId: z.number().int().min(1),
          cells: z.array(z.number().int().min(0)).min(1),
          overrides: z.record(z.string(), z.record(z.string(), jsonValueSchema)).optional(),
          inventory: z
            .array(
              z
                .object({ materialId: z.string().min(1), quantity: z.number().int().min(1) })
                .strict(),
            )
            .optional(),
        })
        .strict(),
    })
    .strict(),
  run: (step, context) => {
    const result = context.session.dispatch({ kind: debugSpawnCommandKind, ...step.debugSpawn });
    return result.ok
      ? null
      : {
          message: `debugSpawn failed (it needs a scenario session): ${describeFailure(result)}`,
        };
  },
});

/**
 * The step types every scenario can use: command, step, assert, assertHash, saveLoad, replay and
 * the scenario-only debugSpawn.
 */
export const builtinScenarioSteps: readonly ScenarioStepType[] = [
  commandStep,
  stepStep,
  assertStep,
  assertHashStep,
  saveLoadStep,
  replayStep,
  debugSpawnStep,
];
