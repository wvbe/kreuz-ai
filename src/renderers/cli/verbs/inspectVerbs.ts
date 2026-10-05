import { collectEntityMarkers } from "../collectEntityMarkers";
import { collectZoneMarks } from "../collectZoneMarks";
import {
  formatCharacter,
  formatEntityDetail,
  formatEntityList,
  formatEvents,
  formatIdentity,
  formatNeeds,
  formatNeedsSummary,
  styledNameOf,
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
    summary: "draw a map as ASCII with zones and entity markers (default: the first map)",
    run: (args, { session }) => {
      const mapId = args[0] === undefined ? session.query.maps().maps[0]?.id : parseCount(args[0]);
      if (mapId === undefined || mapId === null) {
        return verbFailed(args[0] === undefined ? "there is no map" : `bad map id "${args[0]}"`);
      }
      const view = session.query.map(mapId);
      if (view === null) {
        return verbFailed(`map ${mapId} does not exist`);
      }
      return verbDone(
        renderAsciiMap(view, collectEntityMarkers(session, mapId), {
          zones: collectZoneMarks(session, mapId),
        }),
      );
    },
  },
  {
    name: "entities",
    usage: "entities [prototype] [limit]",
    summary: "list entities, optionally of one prototype",
    run: (args, { session }) => {
      const limit = parseCount(args[args.length - 1]);
      const prototype = args[0] !== undefined && parseCount(args[0]) === null ? args[0] : undefined;
      const list = session.query.entities({
        limit: limit !== null && limit >= 1 ? limit : defaultEntityPage,
        ...(prototype === undefined ? {} : { prototype }),
      });
      const names = new Map<number, string>();
      const summaries = new Map<number, string>();
      for (const entity of list.entities) {
        const needs = session.query.run("needs-of", { entityId: entity.id });
        const summary = needs.ok ? formatNeedsSummary(needs.data) : null;
        if (summary !== null) {
          summaries.set(entity.id, summary);
        }
        const identity = session.query.run("identity-of", { entityId: entity.id });
        const name = identity.ok ? styledNameOf(identity.data) : null;
        if (name !== null) {
          names.set(entity.id, name);
        }
      }
      return verbDone(formatEntityList(list, names, summaries));
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
      const identity = session.query.run("identity-of", { entityId: id });
      const membership = session.query.run("faction-of", { entityId: id });
      const needs = session.query.run("needs-of", { entityId: id });
      return verbDone([
        ...formatEntityDetail(detail, id),
        ...formatIdentity(
          identity.ok ? identity.data : null,
          membership.ok ? membership.data : null,
        ),
        ...formatCharacter(skills.ok ? skills.data : null, traits.ok ? traits.data : null),
        ...formatNeeds(needs.ok ? needs.data : null),
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
