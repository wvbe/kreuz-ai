import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Mesh } from "three";
import { describe, expect, it } from "vitest";
import { squareScene } from "../testing/testScenes";
import { TerrainLayer } from "./TerrainLayer";

describe("TerrainLayer", () => {
  // @covers 024:FR-003
  it("draws the whole map as one mesh plus an outline", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <TerrainLayer scene={squareScene(64, 64)} />,
    );
    const group = renderer.scene.children[0];
    expect(group?.type).toBe("Group");
    const kinds = group?.children.map((child) => child.type);
    expect(kinds).toEqual(["Mesh", "LineSegments"]);
    const mesh = group?.children[0]?.instance as Mesh;
    expect(mesh.geometry.index?.count).toBe(64 * 64 * 6);
    await renderer.unmount();
  });
});
