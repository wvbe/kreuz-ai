import { useMemo, useState } from "react";
import type { StandingOrderView } from "../../../game/standing/standingViews";
import { useEngineHost } from "../engine/useEngineHost";
import { parseWhole, standingOrderCommand } from "./commandPayloads";
import { FormError, FormField } from "./FormField";
import { useSender } from "./useSender";
import { useView } from "./useView";

/**
 * A recipe the "Keep in stock" form may offer.
 */
export type RecipeChoice = { id: string; name: string };

/**
 * The recipes that make a material, from the content pack. No query lists recipes by output (the
 * `recipes-for` query needs a workstation), and the pack is static data, not game state, so it is
 * read from the session's content registry, the same list the engine searches when a standing
 * order names no recipe. The form asks for a choice when more than one recipe makes the material.
 *
 * @param materialId - The material to keep in stock; empty gives no recipes.
 * @returns The recipes in content order.
 */
export function useRecipesMaking(materialId: string): readonly RecipeChoice[] {
  const host = useEngineHost();
  return useMemo(() => {
    const wanted = materialId.trim();
    if (wanted === "" || !host.session.hasGame) {
      return [];
    }
    return host.session.engine.content.recipes
      .all()
      .filter((recipe) => recipe.outputs.some((output) => output.materialId === wanted))
      .map((recipe) => ({ id: recipe.id, name: recipe.name }));
  }, [host, materialId]);
}

/**
 * Props of {@link StandingOrderForm}.
 */
export type StandingOrderFormProps = {
  /**
   * Prefilled material, for "Keep in stock..." actions elsewhere in the UI.
   */
  initialMaterialId?: string;
};

/**
 * The "Keep in stock..." form (spec 026): material, target, optional threshold, priority, zone
 * scope and posting board. When several recipes make the material it asks which one; the engine's
 * own `AmbiguousRecipe` refusal shows as a toast and under the recipe field.
 *
 * @param props - Optional prefilled material.
 * @returns The form.
 */
export function StandingOrderForm(props: StandingOrderFormProps) {
  const sender = useSender();
  const [form, setForm] = useState({
    materialId: props.initialMaterialId ?? "",
    recipeId: "",
    target: "",
    threshold: "",
    priority: "",
    zoneId: "",
    boardId: "",
  });
  const recipes = useRecipesMaking(form.materialId);
  const change = (field: keyof typeof form, value: string) => setForm({ ...form, [field]: value });
  return (
    <form
      className="kv-form"
      aria-label="Keep in stock"
      onSubmit={(event) => {
        event.preventDefault();
        sender.sendForm(standingOrderCommand(form));
      }}
    >
      <FormField label="Material" error={sender.errors["materialId"]}>
        <input
          value={form.materialId}
          onChange={(event) => change("materialId", event.target.value)}
        />
      </FormField>
      {recipes.length > 1 ? (
        <FormField label="Recipe (several make this)" error={sender.errors["recipeId"]}>
          <select
            value={form.recipeId}
            onChange={(event) => change("recipeId", event.target.value)}
          >
            <option value="">Choose a recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}
      <FormField label="Keep this many" error={sender.errors["targetQuantity"]}>
        <input value={form.target} onChange={(event) => change("target", event.target.value)} />
      </FormField>
      <FormField label="Restock below (default 75%)" error={sender.errors["restockThreshold"]}>
        <input
          value={form.threshold}
          onChange={(event) => change("threshold", event.target.value)}
        />
      </FormField>
      <FormField label="Priority" error={sender.errors["priority"]}>
        <input value={form.priority} onChange={(event) => change("priority", event.target.value)} />
      </FormField>
      <FormField label="Only count stock in zone (id)" error={sender.errors["scope"]}>
        <input value={form.zoneId} onChange={(event) => change("zoneId", event.target.value)} />
      </FormField>
      <FormField label="Post on board (id)" error={sender.errors["postingBoardId"]}>
        <input value={form.boardId} onChange={(event) => change("boardId", event.target.value)} />
      </FormField>
      <FormError message={sender.errors[""]} />
      <button type="submit">Create standing order</button>
    </form>
  );
}

function OrderRow(props: { order: StandingOrderView }) {
  const sender = useSender();
  const { order } = props;
  const [target, setTarget] = useState(String(order.targetQuantity));
  const [threshold, setThreshold] = useState(String(order.restockThreshold));
  const [priority, setPriority] = useState(String(order.priority));
  const parsed = [parseWhole(target), parseWhole(threshold), parseWhole(priority)];
  return (
    <li data-standing={order.orderId}>
      <strong>
        #{order.orderId} {order.materialId}
      </strong>
      : {String(order.state)}, stock {order.countedStock}/{order.targetQuantity} (restock at{" "}
      {order.restockThreshold}), priority {order.priority}; runs: {order.pendingAdd} on the way,{" "}
      {order.open} open, {order.claimed} claimed
      {order.blocked === null ? "" : `; blocked: ${order.blocked.kind}`}
      <div className="kv-row-actions">
        <input
          aria-label={`Target of order ${order.orderId}`}
          size={4}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        <input
          aria-label={`Threshold of order ${order.orderId}`}
          size={4}
          value={threshold}
          onChange={(event) => setThreshold(event.target.value)}
        />
        <input
          aria-label={`Priority of standing order ${order.orderId}`}
          size={4}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        />
        <button
          type="button"
          disabled={parsed.includes(null)}
          onClick={() =>
            sender.send({
              kind: "UpdateStandingOrder",
              orderId: order.orderId,
              targetQuantity: parsed[0] ?? 0,
              restockThreshold: parsed[1] ?? 0,
              priority: parsed[2] ?? 0,
            })
          }
        >
          Save
        </button>
        <button
          type="button"
          onClick={() =>
            sender.send({
              kind: order.paused ? "ResumeStandingOrder" : "PauseStandingOrder",
              orderId: order.orderId,
            })
          }
        >
          {order.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => sender.send({ kind: "DeleteStandingOrder", orderId: order.orderId })}
        >
          Delete
        </button>
      </div>
      <FormError message={sender.errors[""]} />
    </li>
  );
}

/**
 * The standing-orders tab: the orders with counted stock, state, runs in flight and edit, pause,
 * resume and delete, and the "Keep in stock..." form.
 *
 * @returns The tab.
 */
export function StandingOrdersTab() {
  const orders = useView<readonly StandingOrderView[]>("standing-orders", {}) ?? [];
  return (
    <div className="kv-standing">
      {orders.length === 0 ? <p>No standing orders.</p> : null}
      <ul>
        {orders.map((order) => (
          <OrderRow key={order.orderId} order={order} />
        ))}
      </ul>
      <StandingOrderForm />
    </div>
  );
}
