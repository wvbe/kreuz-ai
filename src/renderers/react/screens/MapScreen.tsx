import { useEffect, useMemo, useState } from "react";
import type { MapEntityView } from "../../../game/api/Views";
import type { AnimalsView } from "../../../game/fauna/animalViews";
import type { CropView } from "../../../game/gathering/gatheringTypes";
import type { DwellingSummary } from "../../../game/housing/housingTypes";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import { useEngineHost } from "../engine/useEngineHost";
import { useEvents, useGameState, useGameVersion, useQuery } from "../engine/useGameState";
import type { QueryState } from "../engine/useGameState";
import { useStaticQuery } from "../engine/useStaticQuery";
import { useStore } from "../engine/useStore";
import { blockedLabel } from "../map/blockedLabel";
import { buildZoneOverlays } from "../map/buildZoneOverlays";
import { wildAnimalMarker } from "../map/entityVisuals";
import { Breadcrumb } from "../map/Breadcrumb";
import type { CropCell } from "../map/instanceLayout";
import type { PlacementGhost } from "../map/MapCanvasProps";
import { buildMapScene } from "../map/mapScene";
import { MapViewport } from "../map/MapViewport";
import type { MapBadge, MapStrokeTool } from "../map/MapViewport";
import { commitStroke } from "../command/commitStroke";
import { StrokeMode } from "../command/strokeMath";
import { ToolMode } from "../selection/ToolStore";
import { SelectionDock } from "./SelectionDock";
import type { MapGeometryView } from "../../../game/api/Views";

type BlockedRow = {
  subject: { kind: string; id: number };
  state: string;
  reasons: readonly { kind: string }[];
  settled: boolean;
};

type PlacementCheck = { valid: boolean };

/**
 * How many ticks the ring around a Bell Tower stays after `bell-tower.rang` (spec 024 FR-033).
 */
const bellIndicatorTicks = 12;

type IdentityView = { styledName: string };

function dataOf<View>(state: QueryState<View>): View | null {
  return state.ok ? state.data : null;
}

/**
 * The map screen (plan 6.2): gathers what the map shows from the queries (`maps`, `map`,
 * `map-geometry`, `map-entities`, `zones`, `crops`, `idle-blocked`, `validate-placement`,
 * `identity-of`), hands it to `MapViewport`, and turns clicks into selection or, in placement
 * mode, into `PlaceFurniture`, `PlaceWall` or `PlaceDoor` commands. Panels of later tasks mount in
 * the `SelectionDock` and read the selection store.
 *
 * @returns The screen.
 */
export function MapScreen() {
  const host = useEngineHost();
  const version = useGameVersion();
  const selection = useStore(host.selection);
  const tool = useStore(host.tools);
  const maps = dataOf(useQuery("maps"));
  const firstMap = maps?.maps.find((entry) => entry.parentId === null) ?? maps?.maps[0];
  const activeMapId = selection.activeMapId ?? firstMap?.id ?? null;

  useEffect(() => {
    if (selection.activeMapId === null && firstMap !== undefined) {
      host.selection.setActiveMap(firstMap.id);
    }
  }, [host, selection.activeMapId, firstMap?.id]);

  const mapArgs = { mapId: activeMapId ?? 0 };
  const map = dataOf(useQuery("map", mapArgs));
  const geometry = dataOf(useStaticQuery<MapGeometryView>("map-geometry", mapArgs));
  const entityView = dataOf(useQuery("map-entities", mapArgs));
  const zoneRows = dataOf(useQuery<readonly ZoneView[]>("zones", mapArgs)) ?? [];
  const cropRows = dataOf(useQuery<readonly CropView[]>("crops", {})) ?? [];
  const blockedRows = dataOf(useQuery<readonly BlockedRow[]>("idle-blocked", {})) ?? [];
  const dwellingRows = dataOf(useQuery<readonly DwellingSummary[]>("dwellings", {})) ?? [];
  const animalRows = dataOf(useQuery<AnimalsView>("animals", {}))?.animals ?? [];
  const bellRings = useEvents("bell-tower.rang");
  const tick = useGameState((state) => state.time.tick);

  const [preview, setPreview] = useState<readonly number[]>([]);
  const stroke = useMemo((): MapStrokeTool | null => {
    if (tool.mode !== ToolMode.Paint && tool.mode !== ToolMode.Walls) {
      return null;
    }
    return {
      mode: tool.mode === ToolMode.Paint ? StrokeMode.Paint : StrokeMode.Rectangle,
      onPreview: setPreview,
      onCommit: (cells) => {
        if (activeMapId !== null) {
          commitStroke(host.commands, tool, activeMapId, cells, (cell) => {
            const check = host.store.query("validate-placement", {
              prototypeId: tool.prototypeId ?? "wall",
              mapId: activeMapId,
              cellIndex: cell,
            });
            return check.ok && (check.data as PlacementCheck).valid;
          });
        }
      },
    };
  }, [host, tool, activeMapId]);

  const terrainKey = map === null ? "" : map.terrain.join("|");
  const scene = useMemo(
    () => (map === null || geometry === null ? null : buildMapScene(map, geometry)),
    // Terrain rarely changes: rebuild the scene only when the terrain text does.
    [map?.id, geometry, terrainKey],
  );
  // The `map-entities` view does not tell wild animals from livestock; the `animals` query does.
  const wildIds = new Set(
    animalRows.filter((animal) => animal.kind === "wild").map((animal) => animal.entityId),
  );
  const entities: readonly MapEntityView[] = (entityView?.entities ?? []).map((entity) =>
    wildIds.has(entity.id)
      ? { ...entity, components: [...entity.components, wildAnimalMarker] }
      : entity,
  );
  const crops: CropCell[] = cropRows
    .filter((crop) => crop.mapId === activeMapId)
    .map((crop) => ({
      cellIndex: crop.cellIndex,
      stage: crop.stage,
      growthPermille: crop.growthPermille,
    }));
  const ringing = new Set(
    bellRings
      .filter((record) => record.tick > tick - bellIndicatorTicks)
      .map((record) => (record.payload as { zoneId?: number }).zoneId),
  );
  const zones = buildZoneOverlays(zoneRows, dwellingRows, ringing);
  if (preview.length > 0) {
    // The stroke in progress is drawn like a zone of the type being designated.
    zones.push({
      zoneId: 0,
      zoneTypeId: tool.zoneTypeId ?? tool.prototypeId ?? "preview",
      cells: preview,
      active: true,
    });
  }
  const prefs = host.getPrefs();
  const badges: MapBadge[] = prefs.showBadges
    ? blockedRows
        .filter((row) => row.settled && row.reasons[0] !== undefined)
        .map((row) => ({
          entityId: row.subject.id,
          label: blockedLabel(row.reasons[0]?.kind ?? ""),
        }))
    : [];

  const ghost = useMemo((): PlacementGhost | null => {
    if (
      tool.mode !== ToolMode.Place ||
      tool.prototypeId === null ||
      selection.hoverCell === null ||
      activeMapId === null
    ) {
      return null;
    }
    const result = host.store.query("validate-placement", {
      prototypeId: tool.prototypeId,
      mapId: activeMapId,
      cellIndex: selection.hoverCell,
    });
    const check = result.ok ? (result.data as PlacementCheck) : null;
    return {
      prototypeId: tool.prototypeId,
      cell: selection.hoverCell,
      valid: check?.valid === true,
    };
  }, [host, version, tool, selection.hoverCell, activeMapId]);

  const hoverLabel = useMemo((): string | null => {
    if (selection.hoverEntityId === null) {
      return null;
    }
    const identity = host.store.query("identity-of", { entityId: selection.hoverEntityId });
    const styled = identity.ok ? (identity.data as IdentityView | null)?.styledName : undefined;
    return (
      styled ?? entities.find((entity) => entity.id === selection.hoverEntityId)?.prototype ?? null
    );
  }, [host, version, selection.hoverEntityId, entities]);

  if (activeMapId === null || scene === null || maps === null) {
    return (
      <section className="kv-screen">
        <p>No map yet. Start a new game.</p>
      </section>
    );
  }
  return (
    <section className="kv-screen kv-map-screen">
      <Breadcrumb
        maps={maps.maps}
        activeId={activeMapId}
        onSelect={(mapId) => host.selection.setActiveMap(mapId)}
      />
      <div className="kv-map-row">
        <MapViewport
          scene={scene}
          entities={entities}
          crops={crops}
          zones={zones}
          showZones={prefs.showZones}
          badges={badges}
          ghost={ghost}
          stroke={stroke}
          hoverLabel={hoverLabel}
          onPrimaryClick={(cell, entityId) => {
            if (tool.mode === ToolMode.Place && tool.prototypeId !== null) {
              if (cell !== null && ghost?.valid === true) {
                host.commands.placeBuild(tool.prototypeId, activeMapId, [cell]);
              }
              return;
            }
            if (entityId !== null) {
              host.selection.selectEntity(entityId, cell);
            } else {
              host.selection.selectCell(cell);
            }
          }}
        />
        <SelectionDock />
      </div>
    </section>
  );
}
