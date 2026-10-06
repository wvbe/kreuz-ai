import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { MapEntityView } from "../../../game/api/Views";
import { useAppServices } from "../AppServices";
import { useEngineHost } from "../engine/useEngineHost";
import { useStore } from "../engine/useStore";
import {
  clampToWorld,
  defaultCamera,
  panByScreen,
  rotateBy,
  screenToGround,
  worldToScreen,
  zoomAt,
} from "./cameraMath";
import type { CameraState, Viewport } from "./cameraMath";
import { extendStroke } from "../command/strokeMath";
import type { StrokeMode } from "../command/strokeMath";
import { createCellPicker } from "./cellPicker";
import { buildCellEntityIndex, pickEntity } from "./entityPicking";
import { classifyEntity, visualHeight } from "./entityVisuals";
import type { CropCell } from "./instanceLayout";
import type { TickMotion } from "./entityMotion";
import type { PlacementGhost, ZoneOverlay } from "./MapCanvasProps";
import type { MapScene } from "./mapScene";

/**
 * A status badge floating over an entity (idle or blocked reason).
 */
export type MapBadge = {
  entityId: number;
  label: string;
};

/**
 * A drag tool of the map (zone painting, the wall rectangle): while it is set, a left drag collects
 * cells instead of panning; right and middle drags still pan.
 */
export type MapStrokeTool = {
  mode: StrokeMode;
  /**
   * Called with the cells of the stroke so far on every change (an empty list when it ends).
   */
  onPreview: (cells: readonly number[]) => void;
  /**
   * Called with the cells when the button is released.
   */
  onCommit: (cells: readonly number[]) => void;
};

/**
 * Props of {@link MapViewport}.
 */
export type MapViewportProps = {
  scene: MapScene;
  entities: readonly MapEntityView[];
  crops: readonly CropCell[];
  zones: readonly ZoneOverlay[];
  showZones: boolean;
  badges: readonly MapBadge[];
  /**
   * The placement ghost for the hovered cell, or null.
   */
  ghost: PlacementGhost | null;
  /**
   * Styled name (or prototype) of the hovered entity, shown next to the pointer.
   */
  hoverLabel: string | null;
  /**
   * Called for a click (not a drag) with the picked cell and entity.
   */
  onPrimaryClick: (cell: number | null, entityId: number | null) => void;
  /**
   * The active drag tool, or null/undefined for select and pan.
   */
  stroke?: MapStrokeTool | null;
  /**
   * The tick clock for sliding entities between cells; absent means no interpolation.
   */
  motion?: TickMotion;
};

const dragThreshold = 4;
const fallbackViewport: Viewport = { width: 800, height: 600 };

/**
 * The interactive map area (spec 024 FR-001, FR-005, FR-009): it owns the camera, turns pointer
 * input into hover, selection and camera moves with the pure math of `cameraMath` and
 * `createCellPicker`, draws DOM badges and the hover label, and hands the scene to the injected
 * `mapCanvas` (three.js in the browser, a stub in tests). Left-drag, middle-drag or right-drag
 * pans, the wheel zooms about the pointer, Q and E (or the buttons) rotate.
 *
 * @param props - The scene and the layers' data.
 * @returns The map area.
 */
export function MapViewport(props: MapViewportProps) {
  const host = useEngineHost();
  const services = useAppServices();
  const selection = useStore(host.selection);
  const frame = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>(fallbackViewport);
  const [camera, setCamera] = useState<CameraState>(() =>
    defaultCamera(props.scene.worldSize, fallbackViewport),
  );
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; button: number } | null>(null);
  const strokeState = useRef<{ start: number; cells: readonly number[] } | null>(null);
  const picker = useMemo(() => createCellPicker(props.scene), [props.scene]);
  const entityIndex = useMemo(() => buildCellEntityIndex(props.entities), [props.entities]);
  const sceneKey = `${props.scene.mapId}:${host.store.epoch()}`;

  // Frame the whole map when another map or game is shown.
  useEffect(() => {
    setCamera(defaultCamera(props.scene.worldSize, viewport));
    // Only the identity of the map and game restarts the camera, not every resize.
  }, [sceneKey]);

  useEffect(() => {
    const element = frame.current;
    if (element === null || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box !== undefined && box.width > 0 && box.height > 0) {
        setViewport({ width: box.width, height: box.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A focus request moves the camera onto a cell (the Idle and Blocked list, entity links).
  const focus = selection.focus;
  useEffect(() => {
    if (focus === null || focus.mapId !== props.scene.mapId) {
      return;
    }
    const center = props.scene.centers[focus.cell];
    if (center !== undefined) {
      setCamera((current) => ({ ...current, centerX: center.x, centerZ: center.z }));
    }
  }, [focus?.nonce]);

  // The wheel listener is not passive so the page does not scroll while zooming.
  useEffect(() => {
    const element = frame.current;
    if (element === null) {
      return undefined;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setCamera((current) =>
        clampToWorld(zoomAt(current, viewport, factor, anchor), props.scene.worldSize),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [viewport, props.scene.worldSize]);

  const local = (event: ReactPointerEvent): { x: number; y: number } => {
    const rect = frame.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const pickAt = (point: { x: number; y: number }) => {
    const cell = picker.pick(screenToGround(camera, viewport, point));
    const entity = cell === null ? null : pickEntity(entityIndex, cell);
    return { cell, entityId: entity?.id ?? null };
  };

  const endStroke = (commit: boolean) => {
    const current = strokeState.current;
    strokeState.current = null;
    if (current === null || props.stroke == null) {
      return;
    }
    props.stroke.onPreview([]);
    if (commit) {
      props.stroke.onCommit(current.cells);
    }
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    const point = local(event);
    if (props.stroke != null && event.button === 0) {
      const cell = pickAt(point).cell;
      if (cell !== null) {
        strokeState.current = { start: cell, cells: [cell] };
        props.stroke.onPreview([cell]);
      }
      return;
    }
    drag.current = { x: point.x, y: point.y, moved: false, button: event.button };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const point = local(event);
    setPointer(point);
    const active = strokeState.current;
    if (active !== null && props.stroke != null) {
      const hit = pickAt(point);
      host.selection.setHover(hit.cell, hit.entityId);
      const next = extendStroke(
        props.stroke.mode,
        active.start,
        active.cells,
        props.scene.centers,
        hit.cell,
      );
      if (next !== active.cells) {
        active.cells = next;
        props.stroke.onPreview(next);
      }
      return;
    }
    const current = drag.current;
    if (current !== null) {
      const deltaX = point.x - current.x;
      const deltaY = point.y - current.y;
      if (current.moved || Math.hypot(deltaX, deltaY) > dragThreshold) {
        current.moved = true;
        current.x = point.x;
        current.y = point.y;
        setCamera((now) => clampToWorld(panByScreen(now, deltaX, deltaY), props.scene.worldSize));
        return;
      }
    }
    const hit = pickAt(point);
    host.selection.setHover(hit.cell, hit.entityId);
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    if (strokeState.current !== null) {
      endStroke(event.button === 0);
      return;
    }
    const current = drag.current;
    drag.current = null;
    if (current === null || current.moved || current.button !== 0) {
      return;
    }
    const hit = pickAt(local(event));
    props.onPrimaryClick(hit.cell, hit.entityId);
  };
  const onPointerLeave = () => {
    endStroke(false);
    drag.current = null;
    setPointer(null);
    host.selection.setHover(null, null);
  };
  const onKeyDown = (event: { key: string }) => {
    if (event.key === "q" || event.key === "Q") {
      setCamera((now) => rotateBy(now, -Math.PI / 4));
    } else if (event.key === "e" || event.key === "E") {
      setCamera((now) => rotateBy(now, Math.PI / 4));
    } else if (event.key === "Escape") {
      endStroke(false);
      host.tools.cancel();
      host.selection.clear();
    }
  };

  const entityById = useMemo(
    () => new Map(props.entities.map((entity) => [entity.id, entity])),
    [props.entities],
  );
  const badges = props.badges.flatMap((badge) => {
    const entity = entityById.get(badge.entityId);
    const center = entity === undefined ? undefined : props.scene.centers[entity.cell];
    if (entity === undefined || center === undefined) {
      return [];
    }
    const spot = worldToScreen(
      camera,
      viewport,
      center,
      visualHeight(classifyEntity(entity)) + 0.3,
    );
    if (
      spot.x < -40 ||
      spot.y < -40 ||
      spot.x > viewport.width + 40 ||
      spot.y > viewport.height + 40
    ) {
      return [];
    }
    return [{ ...badge, left: spot.x, top: spot.y }];
  });
  const MapCanvas = services.mapCanvas;

  return (
    <div
      ref={frame}
      className="kv-map"
      tabIndex={0}
      aria-label="Map"
      data-testid="map-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MapCanvas
        scene={props.scene}
        camera={camera}
        viewport={viewport}
        entities={props.entities}
        crops={props.crops}
        zones={props.zones}
        showZones={props.showZones}
        hoverCell={selection.hoverCell}
        selectedCell={selection.cell}
        selectedEntityId={selection.entityId}
        ghost={props.ghost}
        motion={props.motion}
      />
      <div className="kv-badges" aria-hidden={badges.length === 0}>
        {badges.map((badge) => (
          <span
            key={badge.entityId}
            className="kv-badge"
            data-entity={badge.entityId}
            style={{ left: badge.left, top: badge.top }}
          >
            {badge.label}
          </span>
        ))}
      </div>
      {props.hoverLabel !== null && pointer !== null ? (
        <div className="kv-hover" style={{ left: pointer.x + 14, top: pointer.y + 14 }}>
          {props.hoverLabel}
        </div>
      ) : null}
      <div className="kv-camera-buttons">
        <button type="button" aria-label="Rotate left" onClick={() => onKeyDown({ key: "q" })}>
          Rotate left
        </button>
        <button type="button" aria-label="Rotate right" onClick={() => onKeyDown({ key: "e" })}>
          Rotate right
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() =>
            setCamera((now) =>
              zoomAt(now, viewport, 1.25, { x: viewport.width / 2, y: viewport.height / 2 }),
            )
          }
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() =>
            setCamera((now) =>
              zoomAt(now, viewport, 0.8, { x: viewport.width / 2, y: viewport.height / 2 }),
            )
          }
        >
          -
        </button>
      </div>
    </div>
  );
}
