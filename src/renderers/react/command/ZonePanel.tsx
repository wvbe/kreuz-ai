import { useState } from "react";
import type { UnlockView } from "../../../game/settlement/settlementTypes";
import type { MergeOffer, ZoneView } from "../../../game/zones/zoneTypes";
import { useEngineHost } from "../engine/useEngineHost";
import { useStore } from "../engine/useStore";
import { PaintAction, ToolMode } from "../selection/ToolStore";
import { FormError, FormField } from "./FormField";
import { useSender } from "./useSender";
import { useView } from "./useView";

/**
 * Splits a comma-separated field into trimmed, non-empty ids.
 *
 * @param text - The field's text.
 * @returns The ids.
 */
export function splitIds(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

type FilterFormProps = { zone: ZoneView };

function FilterForm(props: FilterFormProps) {
  const sender = useSender();
  const [categories, setCategories] = useState((props.zone.filter?.categories ?? []).join(", "));
  const [materials, setMaterials] = useState((props.zone.filter?.materialIds ?? []).join(", "));
  return (
    <form
      className="kv-form"
      onSubmit={(event) => {
        event.preventDefault();
        sender.send({
          kind: "SetZoneMaterialFilter",
          zoneId: props.zone.id,
          filter: { categories: splitIds(categories), materialIds: splitIds(materials) },
        });
      }}
    >
      <FormField label="Accepted categories" error={sender.errors["filter"]}>
        <input value={categories} onChange={(event) => setCategories(event.target.value)} />
      </FormField>
      <FormField label="Accepted materials">
        <input value={materials} onChange={(event) => setMaterials(event.target.value)} />
      </FormField>
      <FormError message={sender.errors[""]} />
      <div className="kv-row-actions">
        <button type="submit">Set filter</button>
        <button
          type="button"
          onClick={() =>
            sender.send({ kind: "SetZoneMaterialFilter", zoneId: props.zone.id, filter: null })
          }
        >
          Clear filter
        </button>
      </div>
    </form>
  );
}

/**
 * The zone tools panel (spec 024 FR-010): pick a zone type (locked ones greyed with their tier)
 * and paint cells on the map to designate a zone; list the zones; for the zone under the selected
 * cell add or remove tiles by painting, delete it or set its material filter; answer merge
 * offers.
 *
 * @returns The panel.
 */
export function ZonePanel() {
  const host = useEngineHost();
  const tool = useStore(host.tools);
  const selection = useStore(host.selection);
  const sender = useSender();
  const types = useView<readonly UnlockView[]>("unlocks", { contentKind: "zone_type" }) ?? [];
  const mapId = selection.activeMapId;
  const zones = useView<readonly ZoneView[]>("zones", mapId === null ? {} : { mapId }) ?? [];
  const offers = useView<readonly MergeOffer[]>("zone-merge-offers", {}) ?? [];
  const under = useView<ZoneView | null>(
    "zone-at",
    mapId === null || selection.cell === null
      ? { mapId: 0, cellIndex: -1 }
      : { mapId, cellIndex: selection.cell },
  );
  const painting = tool.mode === ToolMode.Paint;
  return (
    <div className="kv-zones">
      <h4>Designate a zone</h4>
      <ul className="kv-menu-list">
        {types.map((type) => (
          <li key={type.contentId}>
            <button
              type="button"
              disabled={!type.unlocked}
              aria-pressed={painting && tool.zoneTypeId === type.contentId}
              className={type.unlocked ? undefined : "kv-locked"}
              onClick={() =>
                host.tools.enterPaint(PaintAction.Designate, { zoneTypeId: type.contentId })
              }
            >
              {type.name}
            </button>
            {type.unlocked ? null : <span className="kv-badge-lock">{type.lockText}</span>}
          </li>
        ))}
      </ul>
      {painting ? (
        <p className="kv-tool-note">
          {tool.paintAction === PaintAction.Designate
            ? `Drag over cells to designate ${tool.zoneTypeId ?? ""}.`
            : tool.paintAction === PaintAction.AddTiles
              ? `Drag over cells to add them to zone #${tool.zoneId ?? 0}.`
              : `Drag over cells to remove them from zone #${tool.zoneId ?? 0}.`}{" "}
          <button type="button" onClick={() => host.tools.cancel()}>
            Done
          </button>
        </p>
      ) : null}
      {under === null ? null : (
        <section aria-label="Selected zone">
          <h4>
            Zone #{under.id}: {under.zoneTypeId} ({under.status}, {under.tiles.length} tiles)
          </h4>
          {under.gaps.length > 0 ? (
            <ul className="kv-reasons">
              {under.gaps.map((gap, index) => (
                <li key={`${gap.kind}-${index}`}>
                  {gap.kind}
                  {gap.requirement === null ? "" : `: ${gap.requirement}`}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="kv-row-actions">
            <button
              type="button"
              onClick={() => host.tools.enterPaint(PaintAction.AddTiles, { zoneId: under.id })}
            >
              Add tiles
            </button>
            <button
              type="button"
              onClick={() => host.tools.enterPaint(PaintAction.RemoveTiles, { zoneId: under.id })}
            >
              Remove tiles
            </button>
            <button
              type="button"
              onClick={() => sender.send({ kind: "DeleteZone", zoneId: under.id })}
            >
              Delete zone
            </button>
          </div>
          <FilterForm key={under.id} zone={under} />
        </section>
      )}
      <FormError message={sender.errors[""]} />
      {offers.length === 0 ? null : (
        <section aria-label="Merge offers">
          <h4>Merge offers</h4>
          <ul>
            {offers.map((offer) => (
              <li key={offer.offerId}>
                Merge zone #{offer.zoneAId} and #{offer.zoneBId}?{" "}
                <button
                  type="button"
                  onClick={() =>
                    sender.send({ kind: "ConfirmZoneMerge", offerId: offer.offerId, accept: true })
                  }
                >
                  Merge
                </button>
                <button
                  type="button"
                  onClick={() =>
                    sender.send({ kind: "ConfirmZoneMerge", offerId: offer.offerId, accept: false })
                  }
                >
                  Keep apart
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h4>Zones on this map</h4>
      {zones.length === 0 ? <p>No zones yet.</p> : null}
      <ul>
        {zones.map((zone) => (
          <li key={zone.id}>
            <button
              type="button"
              onClick={() => {
                const first = zone.tiles[0];
                if (first !== undefined) {
                  host.selection.selectCell(first);
                  host.selection.requestFocus(zone.mapId, first);
                }
              }}
            >
              #{zone.id} {zone.zoneTypeId}
            </button>{" "}
            {zone.status}, {zone.tiles.length} tiles
          </li>
        ))}
      </ul>
    </div>
  );
}
