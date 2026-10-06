import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Mesh } from "three";
import { describe, expect, it } from "vitest";
import { squareScene } from "../testing/testScenes";
import { StructureLayer } from "./StructureLayer";
import type { ZoneOverlay, ZoneStructure } from "./MapCanvasProps";

const scene = squareScene(8, 8);

function zone(zoneId: number, structure: Partial<ZoneStructure>): ZoneOverlay {
  return {
    zoneId,
    zoneTypeId: "dwelling",
    cells: [zoneId],
    active: true,
    structure: {
      dwellingLevel: null,
      atRisk: false,
      bellTower: false,
      ringing: false,
      ...structure,
    },
  };
}

type Rendered = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

async function render(zones: readonly ZoneOverlay[]): Promise<Rendered> {
  return ReactThreeTestRenderer.create(<StructureLayer scene={scene} zones={zones} />);
}

type Node = Rendered["scene"];

function walk(node: Node): Node[] {
  return node.children.flatMap((child) => [child, ...walk(child)]);
}

function meshes(renderer: Rendered): Map<string, Mesh> {
  return new Map(
    walk(renderer.scene)
      .filter((node) => node.instance.name !== "")
      .map((node) => [node.instance.name, node.instance as Mesh]),
  );
}

function vertices(mesh: Mesh | undefined): number {
  return mesh?.geometry.getAttribute("position").count ?? 0;
}

describe("StructureLayer", () => {
  // @covers 024:FR-004 024:FR-042
  it("draws the model of the dwelling's level and swaps it when the level changes", async () => {
    const renderer = await render([zone(1, { dwellingLevel: "hovel" })]);
    const hovel = vertices(meshes(renderer).get("dwelling-1"));
    expect(hovel).toBeGreaterThan(0);
    await renderer.update(
      <StructureLayer scene={scene} zones={[zone(1, { dwellingLevel: "cottage" })]} />,
    );
    const cottage = vertices(meshes(renderer).get("dwelling-1"));
    expect(cottage).toBeGreaterThan(0);
    expect(cottage).not.toBe(hovel);
    await renderer.unmount();
  });

  // @covers 024:FR-044
  it("raises the at-risk flag only for a dwelling at risk", async () => {
    const calm = await render([zone(1, { dwellingLevel: "hovel" })]);
    expect(meshes(calm).has("at-risk-1")).toBe(false);
    await calm.unmount();
    const risky = await render([zone(1, { dwellingLevel: "hovel", atRisk: true })]);
    expect(meshes(risky).has("at-risk-1")).toBe(true);
    await risky.unmount();
  });

  // @covers 024:FR-033
  it("draws a Bell Tower and its ring only while the bell rings", async () => {
    const quiet = await render([zone(2, { bellTower: true })]);
    expect(meshes(quiet).has("bell-tower-2")).toBe(true);
    expect(meshes(quiet).has("bell-ring-2")).toBe(false);
    await quiet.unmount();
    const ringing = await render([zone(2, { bellTower: true, ringing: true })]);
    expect(meshes(ringing).has("bell-ring-2")).toBe(true);
    await ringing.unmount();
  });

  it("draws nothing for a zone without a structure", async () => {
    const renderer = await render([
      { zoneId: 3, zoneTypeId: "stockpile", cells: [3], active: true },
    ]);
    expect([...meshes(renderer).keys()].filter((name) => name !== "structures")).toEqual([]);
    await renderer.unmount();
  });
});
