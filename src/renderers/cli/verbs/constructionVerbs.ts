import {
  formatBuildMenu,
  formatPlacement,
  formatSites,
  placementRefusal,
} from "../formatConstruction";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb, VerbContext, VerbOutput } from "./Verb";

const buildUsage =
  "usage: build <id> <mapId> <cell>... | build check <id> <mapId> <cell> | build menu | build cancel <jobId> | build remove <entityId> | build pause|resume <jobId> | build priority <jobId> <0-100> | build front <jobId>";

function queue(
  context: VerbContext,
  command: { kind: string; [name: string]: string | number | boolean | number[] },
): VerbOutput {
  const result = context.session.dispatch(command);
  return result.ok
    ? verbDone([`queued ${command.kind} (applied on the next tick)`])
    : verbFailed(`${result.error.kind}: ${result.error.message}`);
}

function cellsOf(args: readonly string[]): number[] | null {
  const cells = args.map((text) => parseCount(text));
  return cells.length > 0 && cells.every((cell): cell is number => cell !== null) ? cells : null;
}

function place(args: readonly string[], context: VerbContext): VerbOutput {
  const [prototypeId, mapText, ...cellTexts] = args;
  const mapId = parseCount(mapText);
  const cells = cellsOf(cellTexts);
  if (prototypeId === undefined || mapId === null || cells === null) {
    return verbFailed(buildUsage);
  }
  // Walls and doors take many cells (one job per cell); everything else exactly one.
  if (prototypeId === "wall") {
    return queue(context, { kind: "PlaceWall", mapId, cells });
  }
  if (prototypeId === "door" && cells.length === 1) {
    return queue(context, { kind: "PlaceDoor", mapId, cell: cells[0] ?? 0 });
  }
  if (cells.length !== 1) {
    return verbFailed(buildUsage);
  }
  const answer = context.session.query.run("validate-placement", {
    prototypeId,
    mapId,
    cellIndex: cells[0] ?? 0,
  });
  const refusal = answer.ok ? placementRefusal(answer.data) : null;
  if (refusal !== null) {
    return verbFailed(refusal);
  }
  return queue(context, {
    kind: "PlaceFurniture",
    furnitureId: prototypeId,
    mapId,
    cell: cells[0] ?? 0,
  });
}

function change(sub: string, args: readonly string[], context: VerbContext): VerbOutput {
  const id = parseCount(args[0]);
  if (id === null) {
    return verbFailed(buildUsage);
  }
  switch (sub) {
    case "cancel":
      return args.length === 1
        ? queue(context, { kind: "CancelConstructionJob", jobId: id })
        : verbFailed(buildUsage);
    case "remove":
      return args.length === 1
        ? queue(context, { kind: "QueueDeconstruction", targetEntityId: id })
        : verbFailed(buildUsage);
    case "pause":
    case "resume":
      return args.length === 1
        ? queue(context, {
            kind: "SetConstructionJobPaused",
            jobId: id,
            paused: sub === "pause",
          })
        : verbFailed(buildUsage);
    case "front":
      return args.length === 1
        ? queue(context, { kind: "MoveConstructionJobToFront", jobId: id })
        : verbFailed(buildUsage);
    default: {
      const priority = parseCount(args[1]);
      return priority === null || args.length !== 2
        ? verbFailed(buildUsage)
        : queue(context, { kind: "SetConstructionPriority", jobId: id, priority });
    }
  }
}

function check(args: readonly string[], context: VerbContext): VerbOutput {
  const [prototypeId, mapText, cellText] = args;
  const mapId = parseCount(mapText);
  const cellIndex = parseCount(cellText);
  if (prototypeId === undefined || mapId === null || cellIndex === null || args.length !== 3) {
    return verbFailed(buildUsage);
  }
  const answer = context.session.query.run("validate-placement", { prototypeId, mapId, cellIndex });
  return answer.ok ? verbDone(formatPlacement(answer.data)) : verbFailed("no game is running");
}

/**
 * Construction verbs: `build` and `sites`.
 */
export const constructionVerbs: readonly Verb[] = [
  {
    name: "sites",
    usage: "sites [mapId]",
    summary: "list the construction jobs with status, delivered materials, progress and blockers",
    run: (args, { session }) => {
      const mapId = args[0] === undefined ? null : parseCount(args[0]);
      if (args[0] !== undefined && (mapId === null || args.length > 1)) {
        return verbFailed("usage: sites [mapId]");
      }
      const queueView = session.query.run("construction-queue", mapId === null ? {} : { mapId });
      return queueView.ok
        ? verbDone(formatSites(queueView.data))
        : verbFailed("the construction queue is not available (no game?)");
    },
  },
  {
    name: "build",
    usage:
      "build <id> <mapId> <cell>... | build check|menu|cancel|remove|pause|resume|priority|front ...",
    summary:
      "place a blueprint (furniture on one cell, walls on many, doors), check a placement, show the build menu, or cancel, take down, pause, resume or reprioritise a job",
    run: (args, context) => {
      const [first, ...rest] = args;
      if (first === undefined) {
        return verbFailed(buildUsage);
      }
      if (first === "menu" && rest.length === 0) {
        const menu = context.session.query.run("build-menu", {});
        return menu.ok ? verbDone(formatBuildMenu(menu.data)) : verbFailed("no game is running");
      }
      if (first === "check") {
        return check(rest, context);
      }
      if (
        first === "cancel" ||
        first === "remove" ||
        first === "pause" ||
        first === "resume" ||
        first === "priority" ||
        first === "front"
      ) {
        return change(first, rest, context);
      }
      return place(args, context);
    },
  },
];
