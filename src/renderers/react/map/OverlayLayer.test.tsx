import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import { squareScene } from "../testing/testScenes";
import { OverlayLayer } from "./OverlayLayer";

const scene = squareScene(8, 8);

async function names(props: Parameters<typeof OverlayLayer>[0]): Promise<string[]> {
  const renderer = await ReactThreeTestRenderer.create(<OverlayLayer {...props} />);
  const found = (renderer.scene.children[0]?.allChildren ?? []).map((child) => child.instance.name);
  await renderer.unmount();
  return found;
}

describe("OverlayLayer", () => {
  it("draws zones, hover, selection and the ghost when asked", async () => {
    const found = await names({
      scene,
      zones: [{ zoneId: 4, zoneTypeId: "stockpile", cells: [1, 2], active: true }],
      showZones: true,
      hoverCell: 3,
      selectedCell: 4,
      ghost: { prototypeId: "chest", cell: 5, valid: false },
    });
    expect(found).toEqual(
      expect.arrayContaining(["zone-4", "hover", "selected", "placement-ghost"]),
    );
  });

  it("hides zones when switched off and draws nothing without input", async () => {
    const hidden = await names({
      scene,
      zones: [{ zoneId: 4, zoneTypeId: "stockpile", cells: [1], active: false }],
      showZones: false,
      hoverCell: null,
      selectedCell: null,
      ghost: null,
    });
    expect(hidden).not.toContain("zone-4");
  });
});
