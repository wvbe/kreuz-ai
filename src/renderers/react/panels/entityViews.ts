import { useMemo } from "react";
import { ContentKind } from "../../../game/api/contentQueries";
import type { ContentEntryView } from "../../../game/api/contentQueries";
import type { EntityDetailView } from "../../../game/api/Views";
import { useEngineHost } from "../engine/useEngineHost";

/**
 * The slots of an `Inventory` component as the `entity` query shows them.
 */
export type InventoryData = {
  slotCount: number;
  weightLimitMilli: number | null;
  slots: { materialId: string; quantity: number }[];
};

/**
 * Reads one component of an `entity` view as the documented component type. The caller names the
 * component and states its data type (the component schemas live in the game folders).
 *
 * @param detail - The entity view.
 * @param name - The component name, for example `Inventory`.
 * @returns The component data, or undefined when the entity has no such component.
 */
export function componentOf<Data>(detail: EntityDetailView, name: string): Data | undefined {
  const data = detail.components[name];
  // eslint-disable-next-line no-restricted-syntax -- JSON to the documented component type
  return data === undefined ? undefined : (data as unknown as Data);
}

/**
 * What the panels show about a material: its name and the weight of one unit.
 */
export type MaterialInfo = { name: string; weightMilli: number };

/**
 * Looks up the name and unit weight of materials from the content (a static answer, computed once
 * per game).
 *
 * @param ids - Material ids.
 * @returns Info by id; ids without content are left out.
 */
export function useMaterialInfo(ids: readonly string[]): ReadonlyMap<string, MaterialInfo> {
  const host = useEngineHost();
  const epoch = host.store.epoch();
  const key = ids.join("|");
  return useMemo(() => {
    const info = new Map<string, MaterialInfo>();
    for (const id of key === "" ? [] : key.split("|")) {
      const result = host.session.query.run("content-entry", { kind: ContentKind.Material, id });
      // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query
      const entry = result.ok ? (result.data as unknown as ContentEntryView | null) : null;
      const weight = entry?.fields["weightMilli"];
      if (entry !== null) {
        info.set(id, { name: entry.name, weightMilli: typeof weight === "number" ? weight : 0 });
      }
    }
    return info;
  }, [host, epoch, key]);
}
