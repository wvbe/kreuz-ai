import { formatAnimals } from "../formatAnimals";
import { verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

/**
 * Fauna verbs: `animals`.
 */
export const faunaVerbs: readonly Verb[] = [
  {
    name: "animals",
    usage: "animals [wild|livestock]",
    summary: "list the animals with cell, health, hunger, held products and what they are doing",
    run: (args, { session }) => {
      const kind = args[0];
      if (args.length > 1 || (kind !== undefined && kind !== "wild" && kind !== "livestock")) {
        return verbFailed("usage: animals [wild|livestock]");
      }
      const result = session.query.run("animals", kind === undefined ? {} : { kind });
      return result.ok
        ? verbDone(formatAnimals(result.data))
        : verbFailed("the animals are not available (no game?)");
    },
  },
];
