// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCamera } from "./cameraMath";
import { MapCanvas } from "./MapCanvas";
import { squareScene } from "../testing/testScenes";

// jsdom has no WebGL: the fiber canvas is replaced by a probe that records how it was configured
// and renders the layers' elements into nothing. The layers have their own tests.
vi.mock("@react-three/fiber", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock must be named like the export it replaces
  Canvas: (props: { orthographic?: boolean; frameloop?: string }) => (
    <div
      data-testid="fiber-canvas"
      data-orthographic={String(props.orthographic === true)}
      data-frameloop={props.frameloop}
    />
  ),
}));

afterEach(cleanup);

describe("MapCanvas", () => {
  it("is an on-demand orthographic canvas", () => {
    const scene = squareScene(4, 4);
    const viewport = { width: 800, height: 600 };
    render(
      <MapCanvas
        scene={scene}
        camera={defaultCamera(scene.worldSize, viewport)}
        viewport={viewport}
        entities={[]}
        crops={[]}
        zones={[]}
        showZones
        hoverCell={null}
        selectedCell={null}
        selectedEntityId={null}
        ghost={null}
      />,
    );
    const canvas = screen.getByTestId("fiber-canvas");
    expect(canvas.getAttribute("data-orthographic")).toBe("true");
    expect(canvas.getAttribute("data-frameloop")).toBe("demand");
  });
});
