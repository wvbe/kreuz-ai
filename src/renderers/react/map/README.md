# map

The map canvas (plan 6.2). Pure math and buffers first, thin three.js layers on top.

Pure, unit-tested without WebGL:
- `cameraMath.ts` - isometric orthographic camera: world to screen and back (a ray through an orthographic camera hits the ground plane at one point, so picking needs no GPU), pan, zoom about the pointer, rotate, visible ground bounds.
- `mapScene.ts` - the `map` and `map-geometry` views in world units (one square tile is one unit; a voronoi map is `sqrt(cellCount)` wide).
- `cellPicker.ts`, `pointInPolygon.ts` - cell under a ground point (bucket grid plus exact polygon test, square and voronoi alike).
- `entityPicking.ts` - the entity a click means on a shared cell.
- `entityVisuals.ts`, `instanceLayout.ts`, `cull.ts` - classification of entities into generated primitives, culled layout of instances and crops.
- `cellBuffers.ts` - triangle and outline buffers of cell polygons; `blockedLabel.ts` - badge text.

three.js, tested with `@react-three/test-renderer` (no WebGL):
- `cellGeometry.ts`, `entityGeometry.ts` - geometries (merged boxes, cylinders and spheres; no external models).
- `entityMotion.ts` - cosmetic movement interpolation (pure): tick delay, tick progress, lerp between cell centres, snap for long jumps; `EntityLayer` slides entities from the previous to the current cell over the real tick interval (`TickMotion`), paused or a map change snaps.
- `TerrainLayer.tsx`, `OverlayLayer.tsx` (zones, hover, selection, placement ghost), `EntityLayer.tsx` (instanced), `CameraRig.tsx`.
- `MapCanvas.tsx` - the `Canvas`; the only part that needs WebGL, replaced in jsdom tests through `AppServices.mapCanvas`. `MapCanvasProps.ts` is its prop contract.

DOM:
- `MapViewport.tsx` - owns the camera, turns pointer and keyboard input into hover, selection and camera moves, draws badges and the hover label. With a `stroke` tool (`MapStrokeTool`) a left drag collects cells (paint or rectangle) instead of panning.
- `Breadcrumb.tsx` - sub-map breadcrumb.
- `StructureLayer.tsx`, `structureGeometry.ts`, `buildZoneOverlays.ts` - the models on zones: the dwelling model of each level (Hovel, Cottage, Timber-Framed House, Burgher House), the red at-risk pennant, the Bell Tower with its ring after `bell-tower.rang` (spec 024 FR-033, FR-042, FR-044; D-233).
- `DoorLayer.tsx` - the doors as one instanced mesh whose leaves swing open while an entity stands in the doorway (FR-016).
