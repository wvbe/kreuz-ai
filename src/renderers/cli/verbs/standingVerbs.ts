import { formatStandingOrder, formatStandingOrders, formatSteward } from "../formatStanding";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb, VerbContext, VerbOutput } from "./Verb";

const standingUsage =
  "usage: standing [list] | standing <orderId> | standing create <materialId> <target> [recipe=ID] [threshold=N] [priority=N] [zone=ID] [board=ID] | standing edit <orderId> [target=N] [threshold=N] [priority=N] [board=ID|none] | standing pause|resume|delete <orderId>";
const stewardUsage =
  "usage: steward | steward appoint <entityId> | steward dismiss | steward review | steward board <boardId|none>";

type Options = { [name: string]: number | string };

function queue(
  context: VerbContext,
  command: { kind: string; [name: string]: string | number | boolean | null | { zoneId: number } },
  done: string,
): VerbOutput {
  const result = context.session.dispatch(command);
  return result.ok
    ? verbDone([`queued ${command.kind}: ${done} (applied on the next tick)`])
    : verbFailed(`${result.error.kind}: ${result.error.message}`);
}

// Reads `name=value` words; a number-valued word must be a count, `board=none` stays text.
function parseOptions(words: readonly string[], allowed: readonly string[]): Options | null {
  const options: Options = {};
  for (const word of words) {
    const [name, value] = word.split("=");
    if (name === undefined || value === undefined || !allowed.includes(name)) {
      return null;
    }
    const count = parseCount(value);
    if (count === null && !(name === "board" && value === "none") && name !== "recipe") {
      return null;
    }
    options[name] = count ?? value;
  }
  return options;
}

function numberOption(options: Options, name: string): number | undefined {
  const value = options[name];
  return typeof value === "number" ? value : undefined;
}

function create(args: readonly string[], context: VerbContext): VerbOutput {
  const [materialId, targetText, ...rest] = args;
  const target = parseCount(targetText);
  const options = parseOptions(rest, ["recipe", "threshold", "priority", "zone", "board"]);
  if (
    materialId === undefined ||
    target === null ||
    options === null ||
    typeof options["board"] === "string"
  ) {
    return verbFailed(standingUsage);
  }
  const threshold = numberOption(options, "threshold");
  const priority = numberOption(options, "priority");
  const zone = numberOption(options, "zone");
  const board = numberOption(options, "board");
  const recipe = options["recipe"];
  return queue(
    context,
    {
      kind: "CreateStandingOrder",
      materialId,
      targetQuantity: target,
      ...(typeof recipe === "string" ? { recipeId: recipe } : {}),
      ...(threshold === undefined ? {} : { restockThreshold: threshold }),
      ...(priority === undefined ? {} : { priority }),
      ...(zone === undefined ? {} : { scope: { zoneId: zone } }),
      ...(board === undefined ? {} : { postingBoardId: board }),
    },
    `keep ${target} ${materialId} in stock`,
  );
}

function edit(args: readonly string[], context: VerbContext): VerbOutput {
  const orderId = parseCount(args[0]);
  const options = parseOptions(args.slice(1), ["target", "threshold", "priority", "board"]);
  if (orderId === null || options === null || Object.keys(options).length === 0) {
    return verbFailed(standingUsage);
  }
  const target = numberOption(options, "target");
  const threshold = numberOption(options, "threshold");
  const priority = numberOption(options, "priority");
  const board = options["board"];
  return queue(
    context,
    {
      kind: "UpdateStandingOrder",
      orderId,
      ...(target === undefined ? {} : { targetQuantity: target }),
      ...(threshold === undefined ? {} : { restockThreshold: threshold }),
      ...(priority === undefined ? {} : { priority }),
      ...(board === undefined ? {} : { postingBoardId: board === "none" ? null : board }),
    },
    `order #${orderId}`,
  );
}

function show(orderId: number, context: VerbContext): VerbOutput {
  const result = context.session.query.run("standing-order", { orderId });
  const lines = result.ok ? formatStandingOrder(result.data) : [];
  return lines.length === 0 ? verbFailed(`no standing order #${orderId}`) : verbDone(lines);
}

function list(context: VerbContext): VerbOutput {
  const result = context.session.query.run("standing-orders", {});
  return result.ok
    ? verbDone(formatStandingOrders(result.data))
    : verbFailed("the standing orders are not available (no game?)");
}

function change(sub: string, args: readonly string[], context: VerbContext): VerbOutput {
  const orderId = parseCount(args[0]);
  if (orderId === null || args.length !== 1) {
    return verbFailed(standingUsage);
  }
  const kinds: { [name: string]: string } = {
    pause: "PauseStandingOrder",
    resume: "ResumeStandingOrder",
    delete: "DeleteStandingOrder",
  };
  return queue(context, { kind: kinds[sub] ?? "", orderId }, `${sub} order #${orderId}`);
}

/**
 * Standing-order verbs (spec 026, D-59): `standing` lists the orders (state, counted stock, runs,
 * why blocked), `standing <id>` explains one, `standing create | edit | pause | resume | delete`
 * send the commands `CreateStandingOrder`, `UpdateStandingOrder`, `PauseStandingOrder`,
 * `ResumeStandingOrder` and `DeleteStandingOrder`; `steward` shows the office and `steward
 * appoint | dismiss | review | board` send `AppointSteward`, `DismissSteward`,
 * `RequestStewardReview` and `SetStewardBoard`.
 */
export const standingVerbs: readonly Verb[] = [
  {
    name: "standing",
    usage: "standing [list | <orderId> | create | edit | pause | resume | delete ...]",
    summary:
      "standing orders (keep N of a material in stock): list them, explain one, create, edit, pause, resume or delete",
    run: (args, context) => {
      const [sub, ...rest] = args;
      if (sub === undefined || (sub === "list" && rest.length === 0)) {
        return list(context);
      }
      if (sub === "create") {
        return create(rest, context);
      }
      if (sub === "edit") {
        return edit(rest, context);
      }
      if (sub === "pause" || sub === "resume" || sub === "delete") {
        return change(sub, rest, context);
      }
      const orderId = parseCount(sub);
      return orderId === null || rest.length > 0
        ? verbFailed(standingUsage)
        : show(orderId, context);
    },
  },
  {
    name: "steward",
    usage: "steward [appoint <entityId> | dismiss | review | board <boardId|none>]",
    summary:
      "the Steward who reviews the standing orders daily: show the office, appoint or dismiss him, ask for a review, set his board",
    run: (args, context) => {
      const [sub, arg] = args;
      if (sub === undefined && args.length === 0) {
        const result = context.session.query.run("steward", {});
        const lines = result.ok ? formatSteward(result.data) : [];
        return lines.length === 0
          ? verbFailed("the Steward is not available (no game?)")
          : verbDone(lines);
      }
      if (sub === "appoint") {
        const entityId = parseCount(arg);
        return entityId === null || args.length !== 2
          ? verbFailed(stewardUsage)
          : queue(context, { kind: "AppointSteward", entityId }, `appoint #${entityId}`);
      }
      if (sub === "dismiss" && args.length === 1) {
        return queue(context, { kind: "DismissSteward" }, "dismiss the Steward");
      }
      if (sub === "review" && args.length === 1) {
        return queue(context, { kind: "RequestStewardReview" }, "an extra review");
      }
      if (sub === "board" && args.length === 2) {
        const boardId = arg === "none" ? null : parseCount(arg);
        return arg !== "none" && boardId === null
          ? verbFailed(stewardUsage)
          : queue(context, { kind: "SetStewardBoard", boardId }, `board ${arg ?? ""}`);
      }
      return verbFailed(stewardUsage);
    },
  },
];
