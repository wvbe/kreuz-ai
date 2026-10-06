import { act, render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { App } from "../App";
import type { AppServices } from "../AppServices";
import { EngineHost } from "../engine/EngineHost";
import type { EngineHostOptions } from "../engine/EngineHost";
import type { MapCanvasProps } from "../map/MapCanvasProps";
import { createFakeScheduler } from "./fakeScheduler";
import type { FakeScheduler } from "./fakeScheduler";

/**
 * What a test of the shell gets back.
 */
export type RenderedApp = RenderResult & {
  host: EngineHost;
  fake: FakeScheduler;
  /**
   * The props the stub canvas was last rendered with.
   */
  canvas: { last: MapCanvasProps | null; renders: number };
  /**
   * Downloads the UI offered, oldest first.
   */
  downloads: { fileName: string; text: string }[];
  /**
   * Starts the standard test game (seed 42, Steady, Small, Hamlet) inside `act`, paused.
   */
  start: () => void;
};

/**
 * Renders the whole app in jsdom against a real `GameSession`, with a hand-driven scheduler and a
 * stub in place of the WebGL canvas (which jsdom cannot run).
 *
 * @param options - Extra host options (a ready session, a storage).
 * @returns The render result plus the host and the recorders.
 */
export function renderApp(options: EngineHostOptions = {}): RenderedApp {
  const fake = createFakeScheduler();
  const host = new EngineHost({ scheduler: fake.scheduler, ...options });
  const canvas: RenderedApp["canvas"] = { last: null, renders: 0 };
  const downloads: RenderedApp["downloads"] = [];
  const services: AppServices = {
    mapCanvas: (props: MapCanvasProps) => {
      canvas.last = props;
      canvas.renders += 1;
      return (
        <div data-testid="map-canvas" data-cells={props.scene.cellCount}>
          canvas
        </div>
      );
    },
    downloadText: (fileName, text) => {
      downloads.push({ fileName, text });
    },
  };
  const result = render(<App host={host} services={services} />);
  const start = () => {
    act(() => {
      host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
    });
  };
  return { ...result, host, fake, canvas, downloads, start };
}
