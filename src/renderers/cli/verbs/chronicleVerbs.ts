import type { JsonValue } from "../../../game/engine/EventBus";
import { formatChronicle, formatJournal } from "../formatChronicle";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

const chronicleUsage = "usage: chronicle [n] [citizen <id> | kind <kind>]";
const defaultCount = 20;
const chronicleKinds: readonly string[] = [
  "arrived",
  "title_earned",
  "mastery_achieved",
  "became_finest",
  "lost_finest",
  "joined_guild",
  "left_guild",
  "took_office",
  "lost_office",
  "first_work",
  "first_trade",
  "home_improved",
  "renamed",
  "died",
  "settlement_milestone",
  "tier_reached",
];

/**
 * Chronicle verbs (spec 028, D-60): `chronicle [n] [citizen <id> | kind <kind>]` (the settlement's
 * Major moments, newest first) and `journal <id>` (one citizen's journal). They read the queries
 * `chronicle` and `journal`; `inspect` also shows the last journal lines.
 */
export const chronicleVerbs: readonly Verb[] = [
  {
    name: "chronicle",
    usage: "chronicle [n] [citizen <id> | kind <kind>]",
    summary:
      "the settlement chronicle, newest first (Major moments, `*`), the last n (default 20); filter by a citizen id (also a dead one) or a moment kind such as tier_reached",
    run: (args, { session }) => {
      const rest = [...args];
      let limit = defaultCount;
      const first = parseCount(rest[0]);
      if (first !== null) {
        if (first < 1) {
          return verbFailed(chronicleUsage);
        }
        limit = first;
        rest.shift();
      }
      const query: { [name: string]: JsonValue } = { limit };
      if (rest.length === 2 && rest[0] === "citizen") {
        const id = parseCount(rest[1]);
        if (id === null || id < 1) {
          return verbFailed(chronicleUsage);
        }
        query["entityId"] = id;
      } else if (rest.length === 2 && rest[0] === "kind") {
        if (!chronicleKinds.includes(rest[1] ?? "")) {
          return verbFailed(`unknown kind "${rest[1] ?? ""}" (${chronicleKinds.join(", ")})`);
        }
        query["kind"] = rest[1] ?? "";
      } else if (rest.length > 0) {
        return verbFailed(chronicleUsage);
      }
      const result = session.query.run("chronicle", query);
      const lines = result.ok ? formatChronicle(result.data) : [];
      return lines.length === 0
        ? verbFailed("the chronicle is not available (no game?)")
        : verbDone(lines);
    },
  },
  {
    name: "journal",
    usage: "journal <id>",
    summary: "the journal of one citizen: arrival, firsts, titles, guilds, offices and homes",
    run: (args, { session }) => {
      const id = parseCount(args[0]);
      if (args.length !== 1 || id === null || id < 1) {
        return verbFailed("usage: journal <id>");
      }
      const result = session.query.run("journal", { entityId: id });
      const lines = result.ok ? formatJournal(result.data) : [];
      return lines.length === 0 ? verbFailed(`entity ${id} has no journal`) : verbDone(lines);
    },
  },
];
