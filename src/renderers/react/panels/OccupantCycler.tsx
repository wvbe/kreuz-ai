import type { CellView } from "../../../game/api/Views";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import "./panels.css";

/**
 * For a tile with several entities: says how many share it and cycles the selection through them
 * (the next one after the selected, wrapping around). Renders nothing for a tile with fewer than
 * two entities.
 *
 * @param props - The map and cell and the selected entity (null when only the tile is selected).
 * @returns The note and button, or nothing.
 */
export function OccupantCycler(props: { mapId: number; cell: number; current: number | null }) {
  const host = useEngineHost();
  const result = useQuery<CellView>("cell", { mapId: props.mapId, cell: props.cell });
  const occupants = result.ok ? result.data.occupants : [];
  if (occupants.length < 2) {
    return null;
  }
  const index = props.current === null ? -1 : occupants.indexOf(props.current);
  const next = occupants[(index + 1) % occupants.length];
  return (
    <p>
      <span className="kv-dim">{occupants.length} entities share this tile. </span>
      <button
        type="button"
        onClick={() => {
          host.selection.selectEntity(next ?? null, props.cell);
        }}
      >
        Next on this tile
      </button>
    </p>
  );
}
