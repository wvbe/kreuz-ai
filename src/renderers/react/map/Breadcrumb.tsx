import type { MapSummaryView } from "../../../game/api/Views";

/**
 * The chain of maps from the outermost one down to a map (spec 024 FR-006).
 *
 * @param maps - Rows of the `maps` view.
 * @param activeId - The map shown.
 * @returns The chain, outermost first; empty when the id is unknown.
 */
export function mapChain(maps: readonly MapSummaryView[], activeId: number): MapSummaryView[] {
  const byId = new Map(maps.map((entry) => [entry.id, entry]));
  const chain: MapSummaryView[] = [];
  let current = byId.get(activeId);
  while (current !== undefined && chain.length <= maps.length) {
    chain.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return chain;
}

/**
 * The sub-map breadcrumb with a back-to-parent button: a cave or cellar shows the way back to
 * the map it hangs off.
 *
 * @param props - The maps, the shown map and the navigation callback.
 * @returns The breadcrumb, or nothing for a single map.
 */
export function Breadcrumb(props: {
  maps: readonly MapSummaryView[];
  activeId: number;
  onSelect: (mapId: number) => void;
}) {
  const chain = mapChain(props.maps, props.activeId);
  if (props.maps.length <= 1) {
    return null;
  }
  const parent = chain.length > 1 ? chain[chain.length - 2] : undefined;
  return (
    <nav className="kv-breadcrumb" aria-label="Maps">
      {parent === undefined ? null : (
        <button type="button" onClick={() => props.onSelect(parent.id)}>
          Back to map {parent.id}
        </button>
      )}
      <ol>
        {chain.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              aria-current={entry.id === props.activeId ? "page" : undefined}
              onClick={() => props.onSelect(entry.id)}
            >
              Map {entry.id} ({entry.gridType})
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
