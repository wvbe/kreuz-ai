import type { RecipeView, WorkstationView } from "../../../game/production/productionViews";
import { useQuery } from "../engine/useGameState";
import { KeyValueList } from "../ui/KeyValueList";
import { EntityNameLink } from "./EntityNameLink";
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
