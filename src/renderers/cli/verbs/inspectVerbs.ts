import { collectEntityMarkers } from "../collectEntityMarkers";
import {
  formatCharacter,
  formatEntityDetail,
  formatEntityList,
  formatEvents,
} from "../formatViews";
import { renderAsciiMap } from "../renderAsciiMap";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

const defaultEventCount = 20;
const defaultEntityPage = 50;

/**
 * Read-only verbs: map, entities, inspect, events.
 */
export const inspectVerbs: readonly Verb[] = [
  {
    name: "map",
    usage: "map [mapId]",
    summary: "draw a map as ASCII with entity markers (default: the first map)",
    run: (args, { session }) => {
      const mapId = args[0] === undefined ? session.query.maps().maps[0]?.id : parseCount(args[0]);
      if (mapId === undefined || mapId === null) {
        return verbFailed(args[0] === undefined ? "there is no map" : `bad map id "${args[0]}"`);
      }
      const view = session.query.map(mapId);
      if (view === null) {
        return verbFailed(`map ${mapId} does not exist`);
      }
      return verbDone(renderAsciiMap(view, collectEntityMarkers(session, mapId)));
    },
  },
  {
    name: "entities",
    usage: "entities [prototype] [limit]",
    summary: "list entities, optionally of one prototype",
    run: (args, { session }) => {
      const limit = parseCount(args[args.length - 1]);
      const prototype = args[0] !== undefined && parseCount(args[0]) === null ? args[0] : undefined;
      return verbDone(
        formatEntityList(
          session.query.entities({
            limit: limit !== null && limit >= 1 ? limit : defaultEntityPage,
            ...(prototype === undefined ? {} : { prototype }),
          }),
        ),
      );
    },
  },
  {
    name: "inspect",
    usage: "inspect <id>",
    summary: "show one entity with its components",
    run: (args, { session }) => {
      const id = parseCount(args[0]);
      if (id === null || id < 1) {
        return verbFailed("usage: inspect <id>");
      }
      const detail = session.query.entity(id);
      const skills = session.query.run("skills-of", { entityId: id });
      const traits = session.query.run("traits-of", { entityId: id });
      return verbDone([
        ...formatEntityDetail(detail, id),
        ...formatCharacter(skills.ok ? skills.data : null, traits.ok ? traits.data : null),
      ]);
    },
  },
  {
    name: "events",
    usage: "events [n]",
    summary: "show the last n events (default 20)",
    run: (args, { session }) => {
      const count = args[0] === undefined ? defaultEventCount : parseCount(args[0]);
      if (count === null) {
        return verbFailed(`n must be a non-negative integer, got "${args[0] ?? ""}"`);
      }
      const view = session.query.eventLog(count);
      return verbDone([
        `${view.events.length} of ${view.total} events`,
        ...formatEvents(view.events, count),
      ]);
    },
  },
];
