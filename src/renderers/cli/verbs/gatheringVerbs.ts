import { formatCrops } from "../formatCrops";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

/**
 * Gathering verbs: `fields`.
 */
export const gatheringVerbs: readonly Verb[] = [
  {
    name: "fields",
    usage: "fields [zoneId]",
    summary: "list the crop cells of the farm fields with stage, growth and ticks until ripe",
    run: (args, { session }) => {
      const zoneId = args[0] === undefined ? null : parseCount(args[0]);
      if (args.length > 1 || (args[0] !== undefined && zoneId === null)) {
        return verbFailed("usage: fields [zoneId]");
      }
      const result = session.query.run("crops", zoneId === null ? {} : { zoneId });
      return result.ok
        ? verbDone(formatCrops(result.data))
        : verbFailed("the crops are not available (no game?)");
    },
  },
];
