import type { SiteView } from "../../../game/construction/constructionViews";
import type { RecipeView, WorkstationView } from "../../../game/production/productionViews";
import type { StockpileView } from "../../../game/storage/storageViews";
import { useQuery } from "../engine/useGameState";
import { KeyValueList } from "../ui/KeyValueList";
import { StackList } from "../ui/StackList";
import { useMaterialInfo } from "./entityViews";
import { EntityNameLink } from "./EntityName";
import { PrimaryStatus } from "./PrimaryStatus";
import { describeReason, humanizeId } from "./reasonText";
import "./panels.css";

/**
 * Inspection of a workstation: what it crafts now, its open orders, the recipes it can make and
 * the reasons it is blocked.
 *
 * @param props - The workstation's entity id.
 * @returns The panel body.
 */
export function WorkstationInspection(props: { entityId: number }) {
  const stations = useQuery<readonly WorkstationView[]>("workstations");
  const recipes = useQuery<readonly RecipeView[]>("recipes-for", { workstationId: props.entityId });
  const station = stations.ok
    ? stations.data.find((row) => row.entityId === props.entityId)
    : undefined;
  if (station === undefined) {
    return <p>This workstation is gone.</p>;
  }
  const crafting = station.crafting;
  return (
    <div className="kv-inspection" data-kind="workstation">
      <h4 className="kv-inspection-title">{humanizeId(station.furnitureId ?? "workstation")}</h4>
      <PrimaryStatus id={props.entityId} />
      <KeyValueList
        rows={[
          { label: "Tags", value: station.tags.map(humanizeId).join(", ") || "none" },
          { label: "Open orders", value: station.unfinishedOrders },
          crafting === null
            ? { label: "Crafting", value: "nothing" }
            : {
                label: "Crafting",
                value: (
                  <span>
                    {humanizeId(crafting.recipeId)} {crafting.progressTicks}/
                    {crafting.durationTicks} by <EntityNameLink entityId={crafting.crafterId} />
                  </span>
                ),
              },
        ]}
      />
      {station.blocked.length === 0 ? null : (
        <>
          <h4>Blocked by</h4>
          <ul>
            {station.blocked.map((reason, index) => (
              <li key={index}>{describeReason(reason)}</li>
            ))}
          </ul>
        </>
      )}
      <h4>Recipes</h4>
      {recipes.ok && recipes.data.length > 0 ? (
        <ul>
          {recipes.data.map((recipe) => (
            <li key={recipe.id} className={recipe.locked ? "kv-locked" : undefined}>
              {recipe.name}
              {recipe.locked
                ? ` (unlocks at ${humanizeId(recipe.unlockTier ?? "a later tier")})`
                : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="kv-dim">No recipes.</p>
      )}
    </div>
  );
}

/**
 * Inspection of a build site: blueprint, status with the why popover, material delivered against
 * required and the builder.
 *
 * @param props - The site's entity id (the job id).
 * @returns The panel body.
 */
export function BuildSiteInspection(props: { entityId: number }) {
  const result = useQuery<SiteView | null>("site", { jobId: props.entityId });
  const site = result.ok ? result.data : null;
  const ids = site === null ? [] : site.required.map((material) => material.materialId);
  const info = useMaterialInfo(ids);
  if (site === null) {
    return <p>This build site is gone.</p>;
  }
  return (
    <div className="kv-inspection" data-kind="build-site">
      <h4 className="kv-inspection-title">
        {site.kind} of {humanizeId(site.prototypeId)}
      </h4>
      <PrimaryStatus id={props.entityId} />
      <KeyValueList
        rows={[
          { label: "Status", value: site.status },
          { label: "Progress", value: `${site.progress}/${site.durationTicks}` },
          {
            label: "Priority",
            value: `${site.priority}${site.urgent ? " (urgent)" : ""}${site.paused ? " (paused)" : ""}`,
          },
          site.builderId === null
            ? { label: "Builder", value: "none" }
            : { label: "Builder", value: <EntityNameLink entityId={site.builderId} /> },
        ]}
      />
      <h4>Materials delivered</h4>
      <StackList
        stacks={site.required.map((material) => ({
          materialId: material.materialId,
          name: info.get(material.materialId)?.name,
          quantity:
            site.delivered.find((item) => item.materialId === material.materialId)?.quantity ?? 0,
          note: `of ${material.quantity}`,
        }))}
      />
      {site.blockers.length === 0 ? null : (
        <ul>
          {site.blockers.map((blocker, index) => (
            <li key={index}>{describeReason(blocker)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Inspection of a stockpile (a storage furniture): priority, accepted goods, slots and contents.
 *
 * @param props - The storage entity id.
 * @returns The panel body.
 */
export function StockpileInspection(props: { entityId: number }) {
  const result = useQuery<readonly StockpileView[]>("stockpiles");
  const pile = result.ok ? result.data.find((row) => row.entityId === props.entityId) : undefined;
  const info = useMaterialInfo(pile?.contents.map((item) => item.materialId) ?? []);
  if (pile === undefined) {
    return <p>This storage is gone.</p>;
  }
  const filter = pile.filter;
  return (
    <div className="kv-inspection" data-kind="stockpile">
      <h4 className="kv-inspection-title">{humanizeId(pile.furnitureId ?? "storage")}</h4>
      <PrimaryStatus id={props.entityId} />
      <KeyValueList
        rows={[
          { label: "Priority", value: pile.priority },
          {
            label: "Accepts",
            value:
              filter === null
                ? "everything"
                : [...filter.categories, ...filter.materialIds].map(humanizeId).join(", "),
          },
          { label: "Reservations", value: pile.reservations.length },
        ]}
      />
      <h4>Contents</h4>
      <StackList
        stacks={pile.contents.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
          name: info.get(item.materialId)?.name,
          unitWeightMilli: info.get(item.materialId)?.weightMilli,
        }))}
        slotCount={pile.slots}
        weightLimitMilli={pile.weightLimitMilli}
      />
    </div>
  );
}
