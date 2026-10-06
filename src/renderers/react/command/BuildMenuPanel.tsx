import { useMemo, useState } from "react";
import type { PlacementResult } from "../../../game/construction/constructionTypes";
import { useEngineHost } from "../engine/useEngineHost";
import { useStore } from "../engine/useStore";
import { ToolMode } from "../selection/ToolStore";
import { groupBuildMenu, lockBadge, usesWallTool } from "./buildMenuModel";
import type { BuildMenuEntry } from "./buildMenuModel";
import { useView } from "./useView";

/**
 * The build menu panel (spec 024 FR-010, FR-035): furniture, walls and doors from `build-menu`,
 * grouped by category and searchable. Locked entries are greyed with "Unlocks at <Tier>" and
 * cannot be chosen. Choosing an entry starts placement (the map shows the ghost, red unless
 * `validate-placement` accepts it, and a click places); the wall entry starts the rectangle tool.
 * While placing, the panel lists the reasons the hovered cell is refused.
 *
 * @returns The panel.
 */
export function BuildMenuPanel() {
  const host = useEngineHost();
  const tool = useStore(host.tools);
  const selection = useStore(host.selection);
  const menu = useView<readonly BuildMenuEntry[]>("build-menu", {});
  const [search, setSearch] = useState("");
  const groups = useMemo(() => groupBuildMenu(menu ?? [], search), [menu, search]);
  const placing = tool.mode === ToolMode.Place || tool.mode === ToolMode.Walls;
  const check = useView<PlacementResult | null>(
    "validate-placement",
    placing &&
      tool.prototypeId !== null &&
      selection.hoverCell !== null &&
      selection.activeMapId !== null
      ? {
          prototypeId: tool.prototypeId,
          mapId: selection.activeMapId,
          cellIndex: selection.hoverCell,
        }
      : { prototypeId: "", mapId: 0, cellIndex: 0 },
  );
  const showCheck = placing && tool.prototypeId !== null && selection.hoverCell !== null;

  const choose = (entry: BuildMenuEntry) => {
    if (entry.locked) {
      return;
    }
    if (usesWallTool(entry.id)) {
      host.tools.enterWalls();
    } else {
      host.tools.enterPlacement(entry.id);
    }
  };

  return (
    <div className="kv-build-menu">
      <input
        type="search"
        aria-label="Search the build menu"
        placeholder="Search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {placing ? (
        <p className="kv-tool-note">
          {tool.mode === ToolMode.Walls
            ? "Drag a rectangle on the map to queue walls."
            : `Placing ${tool.prototypeId ?? ""}: click a cell.`}{" "}
          <button type="button" onClick={() => host.tools.cancel()}>
            Cancel
          </button>
        </p>
      ) : null}
      {showCheck && check !== null && check.valid === false ? (
        <ul className="kv-reasons" aria-label="Why this cell is refused">
          {check.reasons.map((reason, index) => (
            <li key={`${reason.kind}-${index}`}>{reason.text}</li>
          ))}
        </ul>
      ) : null}
      {showCheck && check?.valid === true ? <p className="kv-valid">This cell is valid.</p> : null}
      {groups.map((group) => (
        <section key={group.category} aria-label={group.category}>
          <h4>{group.category}</h4>
          <ul className="kv-menu-list">
            {group.entries.map((entry) => {
              const badge = lockBadge(entry);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    disabled={entry.locked}
                    aria-pressed={placing && tool.prototypeId === entry.id}
                    className={entry.locked ? "kv-locked" : undefined}
                    title={entry.materials
                      .map((material) => `${material.quantity} ${material.materialId}`)
                      .join(", ")}
                    onClick={() => choose(entry)}
                  >
                    {entry.name}
                  </button>
                  {badge === null ? null : <span className="kv-badge-lock">{badge}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {groups.length === 0 ? <p>Nothing matches.</p> : null}
    </div>
  );
}
