import { z } from "zod";
import { DwellingLevel } from "../content/contentTypes";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import { getAiService } from "../ai/aiServiceRegistry";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { factionsSystemId } from "../factions/factionTypes";
import { citizenComponent } from "../factions/citizenComponent";
import { getComponent } from "../ecs/Entity";
import { jobsSystemId } from "../jobs/jobTypes";
import { settlementSystemId } from "../settlement/settlementTypes";
import { getSettlementService } from "../settlement/settlementServiceRegistry";
import { getStatusService } from "../status/statusServiceRegistry";
import { storageSystemId } from "../storage/storageTypes";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { dwellingZoneTypeId, zonesSystemId } from "../zones/zoneTypes";
import { dwellingComponent } from "./dwellingComponent";
import { dwellingProvider } from "./dwellingProvider";
import { registerFetchHandlers } from "./fetchHouseholdGoods";
import { HousingService } from "./HousingService";
import { bindHousingService, getHousingService } from "./housingServiceRegistry";
import { housingSystemId } from "./housingTypes";
import {
  buildDwellingSummaries,
  buildDwellingView,
  buildHousingTotals,
  countDwellingsAtOrAbove,
} from "./housingViews";
import { runHousingEvaluation } from "./runHousingEvaluation";
import { subscribeHousing } from "./subscribeHousing";

const registered = new WeakSet<GameEngine>();

const noArgs = z.object({}).strict();
const idArgs = z.object({ id: z.number().int().min(1) }).strict();
const levelArgs = z.object({ level: z.enum(DwellingLevel) }).strict();

// The bed policy of spec 029 FR-017: a bed on the tiles of a dwelling belongs to its residents,
// who prefer it (rank 0) to any other bed (rank 1); everybody else never uses it.
function installBedPolicy(engine: GameEngine): void {
  getAiService(engine).setBedPolicy((target, sleeper, bed) => {
    const place = bed.components["Position"];
    const mapId = place?.["mapId"];
    const cellIndex = place?.["cellIndex"];
    if (typeof mapId !== "number" || typeof cellIndex !== "number") {
      return 1;
    }
    const zoneService = getZoneService(target);
    const zoneId = zoneService.zoneIdAt(mapId, cellIndex);
    const zone = zoneId === null ? null : zoneService.getZone(zoneId);
    if (zone === null || zone.data.zoneTypeId !== dwellingZoneTypeId) {
      return 1;
    }
    return getComponent(sleeper, citizenComponent)?.homeDwellingId === zoneId ? 0 : null;
  });
}

/**
 * Registers dwellings and household upgrades with an engine (once per engine; the engine does it
 * for itself, after the status system). It adds:
 * - the component `Dwelling` (on `dwelling` zones, saved with the entities);
 * - the slot-13 system `housing`: at `housingEvaluationTickOfDay` the seven-step daily evaluation
 *   (`runHousingEvaluation`), after the housing events' subscriptions (`subscribeHousing`);
 * - the household fetch chore: the task `housing.fetch` and the behavior condition and action
 *   `household_needs_goods` / `fetch_household_goods`;
 * - the Dwelling status provider, the bed policy of the AI (household beds) and the dwelling
 *   counter of the settlement tiers (`setDwellingCounter`);
 * - the queries `dwellings`, `dwelling {id}`, `housing` and `dwellings-at-or-above {level}`. There
 *   are no commands of its own: a dwelling is a zone, designated with `DesignateZone`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerStatus`.
 * @returns The engine's housing service.
 */
export function registerHousing(engine: GameEngine): HousingService {
  if (registered.has(engine)) {
    return getHousingService(engine);
  }
  registered.add(engine);
  const service = new HousingService();
  bindHousingService(engine, service);
  getStatusService(engine).registerProvider(dwellingProvider);
  getSettlementService(engine).setDwellingCounter((level) =>
    countDwellingsAtOrAbove(engine, level),
  );
  installBedPolicy(engine);
  registerFetchHandlers(engine);
  subscribeHousing(engine);
  engine.registerSystem({
    id: housingSystemId,
    dependencies: [
      aiSystemId,
      factionsSystemId,
      jobsSystemId,
      storageSystemId,
      zonesSystemId,
      settlementSystemId,
    ],
    slot: TickSlot.HousingDay,
    components: [dwellingComponent],
    init: () => {
      service.reset();
    },
    run: (context) => {
      if (context.tickOfDay === engine.content.constants.housingEvaluationTickOfDay) {
        runHousingEvaluation(engine, context.tick);
      }
    },
    queries: {
      dwellings: defineQuery({
        schema: noArgs,
        run: (_args, target) => buildDwellingSummaries(target),
      }),
      dwelling: defineQuery({
        schema: idArgs,
        run: (args, target) => buildDwellingView(target, args.id),
      }),
      housing: defineQuery({
        schema: noArgs,
        run: (_args, target) => buildHousingTotals(target),
      }),
      "dwellings-at-or-above": defineQuery({
        schema: levelArgs,
        run: (args, target) => countDwellingsAtOrAbove(target, args.level),
      }),
    },
  });
  return service;
}
