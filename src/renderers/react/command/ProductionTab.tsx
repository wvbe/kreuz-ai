import { useState } from "react";
import type {
  OrderView,
  RecipeView,
  WorkstationView,
} from "../../../game/production/productionViews";
import { parseWhole, productionOrderCommand } from "./commandPayloads";
import { FormError, FormField } from "./FormField";
import { useSender } from "./useSender";
import { useView } from "./useView";

function OrderRow(props: { order: OrderView }) {
  const sender = useSender();
  const [priority, setPriority] = useState(String(props.order.priority));
  const { order } = props;
  const parsed = parseWhole(priority);
  const paused = String(order.status) === "paused";
  return (
    <li data-order={order.orderId}>
      #{order.orderId} {order.recipeId} {order.quantity - order.remaining}/{order.quantity} at
      workstation #{order.workstationId}: {String(order.status)}, priority {order.priority}
      <div className="kv-row-actions">
        <button
          type="button"
          onClick={() =>
            sender.send({
              kind: "SetProductionOrderPaused",
              orderId: order.orderId,
              paused: !paused,
            })
          }
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <input
          aria-label={`Priority of order ${order.orderId}`}
          size={3}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        />
        <button
          type="button"
          disabled={parsed === null}
          onClick={() =>
            sender.send({
              kind: "SetProductionOrderPriority",
              orderId: order.orderId,
              priority: parsed ?? 0,
            })
          }
        >
          Set priority
        </button>
        <button
          type="button"
          onClick={() => sender.send({ kind: "CancelProductionOrder", orderId: order.orderId })}
        >
          Cancel
        </button>
      </div>
      <FormError message={sender.errors[""]} />
    </li>
  );
}

function OrderForm(props: { stations: readonly WorkstationView[] }) {
  const sender = useSender();
  const [workstationId, setWorkstationId] = useState(String(props.stations[0]?.entityId ?? ""));
  const [recipeId, setRecipeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [priority, setPriority] = useState("");
  const stationId = parseWhole(workstationId);
  const recipes =
    useView<readonly RecipeView[]>("recipes-for", { workstationId: stationId ?? 0 }) ?? [];
  return (
    <form
      className="kv-form"
      aria-label="New production order"
      onSubmit={(event) => {
        event.preventDefault();
        sender.sendForm(productionOrderCommand({ workstationId, recipeId, quantity, priority }));
      }}
    >
      <FormField label="Workstation" error={sender.errors["workstationId"]}>
        <select
          value={workstationId}
          onChange={(event) => {
            setWorkstationId(event.target.value);
            setRecipeId("");
          }}
        >
          {props.stations.map((station) => (
            <option key={station.entityId} value={station.entityId}>
              {station.furnitureId ?? "workstation"} #{station.entityId}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Recipe" error={sender.errors["recipeId"]}>
        <select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
          <option value="">Choose a recipe</option>
          {recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id} disabled={recipe.locked}>
              {recipe.name}
              {recipe.locked ? ` (Unlocks at ${recipe.unlockTier ?? "a later tier"})` : ""}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Quantity" error={sender.errors["quantity"]}>
        <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </FormField>
      <FormField label="Priority" error={sender.errors["priority"]}>
        <input value={priority} onChange={(event) => setPriority(event.target.value)} />
      </FormField>
      <FormError message={sender.errors[""]} />
      <button type="submit">Create order</button>
    </form>
  );
}

/**
 * The production orders of the government panel: the orders with pause, priority and cancel, and
 * the form that creates one from the recipes of a workstation (`recipes-for`; locked recipes are
 * greyed with their tier).
 *
 * @returns The tab.
 */
export function ProductionTab() {
  const orders = useView<readonly OrderView[]>("production-orders", {}) ?? [];
  const stations = useView<readonly WorkstationView[]>("workstations", {}) ?? [];
  return (
    <div className="kv-production">
      {orders.length === 0 ? <p>No production orders.</p> : null}
      <ul>
        {orders.map((order) => (
          <OrderRow key={order.orderId} order={order} />
        ))}
      </ul>
      {stations.length === 0 ? (
        <p>Build a workstation to create orders.</p>
      ) : (
        <OrderForm key={stations.length} stations={stations} />
      )}
    </div>
  );
}
