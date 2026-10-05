import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

const subjectSchema = z.object({ kind: z.string(), id: z.number() });

const reasonSchema = z.object({
  kind: z.string(),
  params: z.record(z.string(), jsonSchema),
  causeRef: subjectSchema.nullable(),
});

const activitySchema = z.object({ kind: z.string(), params: z.record(z.string(), jsonSchema) });

const explanationSchema = z.object({
  subject: subjectSchema,
  state: z.string(),
  activity: activitySchema.nullable(),
  reasons: z.array(reasonSchema),
  chain: z.array(
    z.object({
      subject: subjectSchema,
      state: z.string(),
      activity: activitySchema.nullable(),
      reason: reasonSchema.nullable(),
    }),
  ),
  end: z.string(),
});

const idleRowSchema = z.object({
  subject: subjectSchema,
  state: z.string(),
  reasons: z.array(reasonSchema),
  sinceTick: z.number(),
  settled: z.boolean(),
});

const partySchema = z.object({
  subject: subjectSchema.nullable(),
  source: z.string(),
  quantity: z.number(),
});

const flowRowSchema = z.object({
  materialId: z.string(),
  producedPerDayMilli: z.number(),
  consumedPerDayMilli: z.number(),
  netPerDayMilli: z.number(),
  stock: z.number(),
  daysOfSupplyMilli: z.number().nullable(),
  trend: z.array(z.number()),
  windowProduced: z.number(),
  windowConsumed: z.number(),
  producers: z.array(partySchema),
  consumers: z.array(partySchema),
});

type Subject = z.infer<typeof subjectSchema>;
type Reason = z.infer<typeof reasonSchema>;
type FlowRow = z.infer<typeof flowRowSchema>;

function describeParam(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => describeParam(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .map(([name, item]) => `${name}=${describeParam(item)}`)
      .join(",")}}`;
  }
  return String(value);
}

function describeSubject(subject: Subject): string {
  return `${subject.kind}#${subject.id}`;
}

/**
 * One reason as short text: the kind, its params and the cause.
 *
 * @param reason - A reason of the `explain` or `idle-blocked` query.
 * @returns For example `MissingInput materialId=flour required=1 available=0 cause=Workstation#11`.
 */
export function describeStatusReason(reason: Reason): string {
  const params = Object.entries(reason.params).map(
    ([name, value]) => `${name}=${describeParam(value)}`,
  );
  const cause = reason.causeRef === null ? [] : [`cause=${describeSubject(reason.causeRef)}`];
  return [reason.kind, ...params, ...cause].join(" ");
}

function describeActivity(activity: z.infer<typeof activitySchema>): string {
  const params = Object.entries(activity.params).map(
    ([name, value]) => `${name}=${describeParam(value)}`,
  );
  return [activity.kind, ...params].join(" ");
}

/**
 * Formats the `explain` query for `why`: the subject, its state, every reason and the chain of
 * causes (the "why?" of spec 025).
 *
 * @param view - Data of the `explain` query.
 * @returns Output lines, empty when the view is not an explanation (the subject does not exist).
 */
export function formatExplanation(view: JsonValue): string[] {
  const parsed = explanationSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const explanation = parsed.data;
  const head = `${describeSubject(explanation.subject)}: ${explanation.state}${
    explanation.activity === null ? "" : ` (${describeActivity(explanation.activity)})`
  }`;
  const reasons = explanation.reasons.map((reason) => `  ${describeStatusReason(reason)}`);
  const chain =
    explanation.chain.length < 2
      ? []
      : [
          `  because (${explanation.end}):`,
          ...explanation.chain
            .slice(1)
            .map(
              (link) =>
                `    ${describeSubject(link.subject)}: ${link.state}${
                  link.reason === null ? "" : ` ${describeStatusReason(link.reason)}`
                }`,
            ),
        ];
  return [head, ...reasons, ...chain];
}

/**
 * Formats the `idle-blocked` query for `idle`: one line per subject, oldest stall first.
 *
 * @param view - Data of the `idle-blocked` query.
 * @returns Output lines; a note when nothing is idle or blocked, empty for a foreign view.
 */
export function formatIdleBlocked(view: JsonValue): string[] {
  const parsed = z.array(idleRowSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["nothing is idle or blocked"];
  }
  return parsed.data.map((row) => {
    const primary = row.reasons[0];
    return `${describeSubject(row.subject)} ${row.state} since ${row.sinceTick}${
      row.settled ? "" : " (settling)"
    }: ${primary === undefined ? "?" : describeStatusReason(primary)}`;
  });
}

function perDay(milli: number): string {
  const sign = milli < 0 ? "-" : "";
  const abs = Math.abs(milli);
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000)
    .padStart(3, "0")
    .slice(0, 1)}`;
}

function describeFlowRow(row: FlowRow): string {
  const supply =
    row.daysOfSupplyMilli === null ? "surplus" : `${perDay(row.daysOfSupplyMilli)} days of supply`;
  return `${row.materialId}: +${perDay(row.producedPerDayMilli)}/day -${perDay(
    row.consumedPerDayMilli,
  )}/day net ${perDay(row.netPerDayMilli)}/day, stock ${row.stock}, ${supply}, trend ${row.trend.join(",")}`;
}

function describeParty(party: z.infer<typeof partySchema>): string {
  return `${party.quantity} ${party.source}${
    party.subject === null ? "" : ` ${describeSubject(party.subject)}`
  }`;
}

/**
 * Formats the `flow` query for `flow`: one line per material, largest deficit first.
 *
 * @param view - Data of the `flow` query.
 * @returns Output lines; a note when nothing was produced or consumed yet, empty for a foreign view.
 */
export function formatFlow(view: JsonValue): string[] {
  const parsed = z.array(flowRowSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.length === 0
    ? ["no production or consumption recorded yet"]
    : parsed.data.map(describeFlowRow);
}

/**
 * Formats the `flow-of` query for `flow <materialId>`: the row plus who produced and consumed.
 *
 * @param view - Data of the `flow-of` query.
 * @returns Output lines, empty when the ledger has nothing for the material (null view).
 */
export function formatFlowOf(view: JsonValue): string[] {
  const parsed = flowRowSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const row = parsed.data;
  return [
    describeFlowRow(row),
    `  window: produced ${row.windowProduced}, consumed ${row.windowConsumed}`,
    ...row.producers.map((party) => `  produced by ${describeParty(party)}`),
    ...row.consumers.map((party) => `  consumed by ${describeParty(party)}`),
  ];
}
