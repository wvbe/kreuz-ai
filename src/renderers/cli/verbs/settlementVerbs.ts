import type { JsonValue } from "../../../game/engine/EventBus";
import { formatMilestones, formatTier, formatUnlocks } from "../formatSettlement";
import { verbDone, verbFailed } from "./Verb";
import type { Verb, VerbContext, VerbOutput } from "./Verb";

const tiers: readonly string[] = ["hamlet", "village", "market_town", "chartered_town"];
const unlocksUsage =
  "usage: unlocks [all | <tier> | <kind>] (tier: hamlet, village, market_town, chartered_town; kind: furniture, zone_type, recipe, job_type, dwelling_level)";
const kinds: readonly string[] = ["furniture", "zone_type", "recipe", "job_type", "dwelling_level"];

function show(
  context: VerbContext,
  name: string,
  args: { [name: string]: JsonValue },
  format: (view: JsonValue) => string[],
  failure: string,
): VerbOutput {
  const result = context.session.query.run(name, args);
  if (!result.ok) {
    return verbFailed(failure);
  }
  const lines = format(result.data);
  return lines.length === 0 ? verbFailed(failure) : verbDone(lines);
}

/**
 * Settlement verbs (spec 027, D-57): `tier` (the tier, when each was reached and the next tier's
 * requirement checklist), `unlocks` (what is locked and at which tier, `Unlocks at <Tier>`) and
 * `milestones` (the seven milestones, reached or not). They read the queries `settlement-progress`,
 * `unlocks` and `milestones`; there are no settlement commands.
 */
export const settlementVerbs: readonly Verb[] = [
  {
    name: "tier",
    usage: "tier",
    summary:
      "the settlement tier and its noun, when each tier was reached, and the checklist of what the next tier needs ([x] met)",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: tier")
        : show(
            context,
            "settlement-progress",
            {},
            formatTier,
            "the settlement tier is not available (no game?)",
          ),
  },
  {
    name: "unlocks",
    usage: "unlocks [all | <tier> | <kind>]",
    summary:
      "content that the tier in force has not unlocked, with the tier that unlocks it; `all` lists everything, a tier or a kind filters",
    run: (args, context) => {
      const filter = args[0];
      if (args.length > 1) {
        return verbFailed(unlocksUsage);
      }
      let query: { [name: string]: JsonValue } = { lockedOnly: true };
      if (filter === "all") {
        query = {};
      } else if (filter !== undefined && tiers.includes(filter)) {
        query = { tier: filter };
      } else if (filter !== undefined && kinds.includes(filter)) {
        query = { contentKind: filter };
      } else if (filter !== undefined) {
        return verbFailed(unlocksUsage);
      }
      return show(context, "unlocks", query, formatUnlocks, "unlocks are not available (no game?)");
    },
  },
  {
    name: "milestones",
    usage: "milestones",
    summary:
      "the seven settlement milestones: the tick and subjects of the ones reached, `not yet` for the rest",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: milestones")
        : show(
            context,
            "milestones",
            {},
            formatMilestones,
            "milestones are not available (no game?)",
          ),
  },
];
