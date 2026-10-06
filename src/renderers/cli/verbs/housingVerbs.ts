import { formatHome, formatHomes } from "../formatHousing";
import { verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

const noGame = "housing is not available (no game?)";

/**
 * Housing verbs (spec 029, D-58): `homes` (the totals and every dwelling) and `home <id>` (one
 * dwelling with the checklist of its current and next level, its streaks and the foods eaten). They
 * read the queries `housing`, `dwellings` and `dwelling`; a dwelling is designated like any zone
 * (`zone designate dwelling <mapId> <cell>...`), so there are no housing commands.
 */
export const housingVerbs: readonly Verb[] = [
  {
    name: "homes",
    usage: "homes",
    summary:
      "the dwellings: totals (housed, homeless, free slots, dwellings per level) and one line per dwelling with its level, residents, rent and streaks",
    run: (args, context) => {
      if (args.length > 0) {
        return verbFailed("usage: homes");
      }
      const totals = context.session.query.run("housing", {});
      const rows = context.session.query.run("dwellings", {});
      if (!totals.ok || !rows.ok) {
        return verbFailed(noGame);
      }
      const lines = formatHomes(totals.data, rows.data);
      return lines.length === 0 ? verbFailed(noGame) : verbDone(lines);
    },
  },
  {
    name: "home",
    usage: "home <dwellingId>",
    summary:
      "one dwelling: level, residents, the upgrade and downgrade streaks, what its current and next level need (`[x]` met) and the foods eaten lately",
    run: (args, context) => {
      const id = Number(args[0]);
      if (args.length !== 1 || !Number.isInteger(id) || id < 1) {
        return verbFailed("usage: home <dwellingId>");
      }
      const result = context.session.query.run("dwelling", { id });
      if (!result.ok) {
        return verbFailed(noGame);
      }
      const lines = formatHome(result.data);
      return lines.length === 0 ? verbFailed(`entity ${id} is not a dwelling`) : verbDone(lines);
    },
  },
];
