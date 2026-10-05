import { formatEvents } from "../formatViews";
import { formatZone, formatZoneList } from "../formatZones";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

const zoneUsage =
  "usage: zone <zoneId> | zone designate <zoneTypeId> <mapId> <cell>... | zone delete <zoneId>";

/**
 * Zone verbs: `zones` and `zone`.
 */
export const zoneVerbs: readonly Verb[] = [
  {
    name: "zones",
    usage: "zones [mapId]",
    summary: "list the zones with type, status, size and the first unmet requirement",
    run: (args, { session }) => {
      const mapId = args[0] === undefined ? null : parseCount(args[0]);
      if (args[0] !== undefined && (mapId === null || args.length > 1)) {
        return verbFailed("usage: zones [mapId]");
      }
      const result = session.query.run("zones", mapId === null ? {} : { mapId });
      return result.ok
        ? verbDone(formatZoneList(result.data))
        : verbFailed("the zones are not available (no game?)");
    },
  },
  {
    name: "zone",
    usage: "zone <zoneId> | zone designate <type> <mapId> <cell>... | zone delete <zoneId>",
    summary:
      "inspect a zone (tiles, filter, workers, gaps), or queue designating or deleting a zone",
    run: (args, { session }) => {
      const [first, second, third] = args;
      if (first === "designate") {
        const mapId = parseCount(third);
        const cells = args.slice(3).map(parseCount);
        if (second === undefined || mapId === null || cells.length === 0 || cells.includes(null)) {
          return verbFailed(zoneUsage);
        }
        const result = session.dispatch({
          kind: "DesignateZone",
          zoneTypeId: second,
          mapId,
          cells: cells.filter((cell) => cell !== null),
        });
        return result.ok
          ? verbDone([
              "queued DesignateZone (applied on the next tick)",
              ...formatEvents(result.events),
            ])
          : verbFailed(`${result.error.kind}: ${result.error.message}`);
      }
      if (first === "delete") {
        const zoneId = parseCount(second);
        if (zoneId === null || args.length !== 2) {
          return verbFailed(zoneUsage);
        }
        const result = session.dispatch({ kind: "DeleteZone", zoneId });
        return result.ok
          ? verbDone(["queued DeleteZone (applied on the next tick)"])
          : verbFailed(`${result.error.kind}: ${result.error.message}`);
      }
      const zoneId = parseCount(first);
      if (zoneId === null || args.length !== 1) {
        return verbFailed(zoneUsage);
      }
      const view = session.query.run("zone", { zoneId });
      if (!view.ok) {
        return verbFailed("the zones are not available (no game?)");
      }
      const lines = formatZone(view.data);
      return lines.length === 0 ? verbDone([`zone ${zoneId} does not exist`]) : verbDone(lines);
    },
  },
];
