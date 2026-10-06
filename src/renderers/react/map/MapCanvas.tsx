import { Canvas } from "@react-three/fiber";
import { CameraRig } from "./CameraRig";
import { EntityLayer } from "./EntityLayer";
import type { MapCanvasProps } from "./MapCanvasProps";
import { OverlayLayer } from "./OverlayLayer";
import { StructureLayer } from "./StructureLayer";
import { TerrainLayer } from "./TerrainLayer";

/**
 * The WebGL canvas of the map (spec 024 FR-001): an orthographic isometric camera over the
 * terrain, zone and entity layers. It is a pure function of its props; all state and input live in
 * `MapViewport`. This is the only component that needs WebGL, which is why tests replace it with
 * a stub through `AppServices.mapCanvas`.
 *
 * @param props - What to draw.
 * @returns The canvas element.
 */
export function MapCanvas(props: MapCanvasProps) {
  return (
    <Canvas
      className="kv-canvas"
      orthographic
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ near: 0.1, far: 1000, zoom: props.camera.zoom }}
    >
      <color attach="background" args={[0x1b2230]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[30, 60, 20]} intensity={1.4} />
      <CameraRig camera={props.camera} />
      <TerrainLayer scene={props.scene} />
      <OverlayLayer
        scene={props.scene}
        zones={props.zones}
        showZones={props.showZones}
        hoverCell={props.hoverCell}
        selectedCell={props.selectedCell}
        ghost={props.ghost}
      />
      <StructureLayer scene={props.scene} zones={props.zones} />
      <EntityLayer
        scene={props.scene}
        camera={props.camera}
        viewport={props.viewport}
        entities={props.entities}
        crops={props.crops}
        motion={props.motion}
      />
    </Canvas>
  );
}
