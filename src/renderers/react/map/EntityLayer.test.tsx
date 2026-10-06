import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import { squareScene } from "../testing/testScenes";
import { defaultCamera } from "./cameraMath";
import { EntityLayer } from "./EntityLayer";

const scene = squareScene(64, 64);
const viewport = { width: 800, height: 600 };
const camera = defaultCamera(scene.worldSize, viewport);

function citizen(id: number, cell: number) {
  return { id, prototype: "farmer", cell, components: ["Citizen", "Needs", "Position"] };
}

describe("EntityLayer", () => {
  it("instances one mesh per visual kind present, with the right counts", async () => {
    const entities = [
      citizen(1, 100),
      citizen(2, 101),
      { id: 3, prototype: "wall", cell: 102, components: ["Position"] },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <EntityLayer
        scene={scene}
        camera={camera}
        viewport={viewport}
        entities={entities}
        crops={[{ cellIndex: 103, stage: "Ripe", growthPermille: 1000 }]}
      />,
    );
    const meshes = renderer.scene.children[0]?.allChildren ?? [];
    const byName = new Map(
      meshes.map((child) => [child.instance.name, (child.instance as { count: number }).count]),
    );
    expect(byName.get("citizen")).toBe(2);
    expect(byName.get("wall")).toBe(1);
    expect(byName.get("crops")).toBe(1);
    expect(byName.has("door")).toBe(false);
    await renderer.unmount();
  });

  it("culls entities outside the visible ground", async () => {
    const zoomed = { ...camera, zoom: 160, centerX: 2, centerZ: 2 };
    const renderer = await ReactThreeTestRenderer.create(
      <EntityLayer
        scene={scene}
        camera={zoomed}
        viewport={viewport}
        entities={[citizen(1, 64 * 60 + 60), citizen(2, 66)]}
        crops={[]}
      />,
    );
    const citizens = (renderer.scene.children[0]?.allChildren ?? []).find(
      (child) => child.instance.name === "citizen",
    );
    expect((citizens?.instance as { count: number } | undefined)?.count ?? 0).toBeLessThanOrEqual(
      1,
    );
    await renderer.unmount();
  });

  it("handles 4096 entities on a 64x64 map", async () => {
    const entities = Array.from({ length: 4096 }, (_unused, index) => citizen(index + 1, index));
    const renderer = await ReactThreeTestRenderer.create(
      <EntityLayer
        scene={scene}
        camera={camera}
        viewport={viewport}
        entities={entities}
        crops={[]}
      />,
    );
    const citizens = (renderer.scene.children[0]?.allChildren ?? []).find(
      (child) => child.instance.name === "citizen",
    );
    expect((citizens?.instance as { count: number }).count).toBeGreaterThan(100);
    await renderer.unmount();
  });
});
