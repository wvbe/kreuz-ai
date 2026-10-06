// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { squareScene } from "../testing/testScenes";
import { defaultCamera } from "./cameraMath";
import { LazyMapCanvas } from "./LazyMapCanvas";

// jsdom has no WebGL: the fiber canvas is a probe (see MapCanvas.test.tsx).
vi.mock("@react-three/fiber", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock must be named like the export it replaces
  Canvas: () => <div data-testid="fiber-canvas" />,
}));

afterEach(cleanup);

describe("LazyMapCanvas", () => {
  // @covers 024:FR-001
  it("shows the fallback first and the canvas once the chunk has loaded", async () => {
    const scene = squareScene(4, 4);
    const viewport = { width: 800, height: 600 };
    render(
      <Suspense fallback={<p>loading the chunk</p>}>
        <LazyMapCanvas
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
        />
      </Suspense>,
    );
    expect(screen.getByText("loading the chunk")).toBeTruthy();
    expect(await screen.findByTestId("fiber-canvas")).toBeTruthy();
    expect(screen.queryByText("loading the chunk")).toBeNull();
  });
});
