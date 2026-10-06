import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { NotableMomentKind } from "../content/contentTypes";
import type { GameEngine } from "../engine/GameEngine";
import { factionsSystemId } from "../factions/factionTypes";
import { housingSystemId } from "../housing/housingTypes";
import { identitySystemId } from "../identity/identityTypes";
import { settlementSystemId } from "../settlement/settlementTypes";
import { skillsSystemId } from "../skills/registerSkills";
import { standingSystemId } from "../standing/standingTypes";
import { buildChronicleView, buildJournalView, buildMomentsSince } from "./chronicleViews";
import { chronicleSystemId, defaultChronicleLimit } from "./chronicleTypes";
import { renameCitizen } from "./renameCitizen";
import { subscribeMoments } from "./subscribeMoments";

const registered = new WeakSet<GameEngine>();

const idSchema = z.number().int().min(1);
const chronicleArgs = z
  .object({
    entityId: idSchema.optional(),
    kind: z.enum(NotableMomentKind).optional(),
    limit: z.number().int().min(1).max(1000).default(defaultChronicleLimit),
  })
  .strict();
const journalArgs = z.object({ entityId: idSchema }).strict();
const sinceArgs = z.object({ tick: z.number().int().min(0) }).strict();
const renameArgs = z
  .object({ entityId: idSchema, givenName: z.string(), byname: z.string().nullable() })
  .strict();

/**
 * Registers the chronicle with an engine (once per engine; the engine does it for itself, after
 * the standing system). It adds:
 * - the moment sources (`subscribeMoments`): `Arrived`, `TitleEarned`, `MasteryAchieved`,
 *   `BecameFinest`, `LostFinest`, `JoinedGuild`, `LeftGuild`, `TookOffice`, `LostOffice`,
 *   `FirstWork`, `FirstTrade`, `HomeImproved`, `SettlementMilestone` and `TierReached`
 *   (`Renamed` comes from the command, `Died` from the delete hook of `registerDeathHook`), each
 *   recorded into the citizen's journal and, when Major, the settlement chronicle, with the event
 *   `chronicle.moment.recorded`;
 * - the command `RenameCitizen {entityId, givenName, byname}` (errors `InvalidName`,
 *   `UnknownEntity`);
 * - the queries `chronicle {entityId?, kind?, limit?}` (newest first), `journal {entityId}` and
 *   `moments-since {tick}`.
 *
 * The state lives in the `Identity` journals and the `SettlementChronicle` component, which the
 * identity and settlement systems already save.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerStanding`.
 */
export function registerChronicle(engine: GameEngine): void {
  if (registered.has(engine)) {
    return;
  }
  registered.add(engine);
  subscribeMoments(engine);
  engine.registerSystem({
    id: chronicleSystemId,
    dependencies: [
      identitySystemId,
      factionsSystemId,
      skillsSystemId,
      settlementSystemId,
      housingSystemId,
      standingSystemId,
    ],
    commandHandlers: {
      RenameCitizen: defineCommand({
        schema: renameArgs,
        handler: (payload, target) => ({
          changed: renameCitizen(target, payload.entityId, payload.givenName, payload.byname),
        }),
      }),
    },
    queries: {
      chronicle: defineQuery({
        schema: chronicleArgs,
        run: (args, target) =>
          buildChronicleView(
            target,
            {
              ...(args.entityId === undefined ? {} : { entityId: args.entityId }),
              ...(args.kind === undefined ? {} : { kind: args.kind }),
            },
            args.limit,
          ),
      }),
      journal: defineQuery({
        schema: journalArgs,
        run: (args, target) => buildJournalView(target, args.entityId),
      }),
      "moments-since": defineQuery({
        schema: sinceArgs,
        run: (args, target) => buildMomentsSince(target, args.tick),
      }),
    },
  });
}
