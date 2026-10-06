// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { useView } from "./useView";

afterEach(cleanup);

describe("useView", () => {
  it("returns the view, or null when the query fails", () => {
    const host = new EngineHost();
    host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
    const wrapper = (props: { children: ReactNode }) =>
      createElement(EngineProvider, { host, children: props.children });
    const { result } = renderHook(
      () => ({
        zones: useView<readonly number[]>("zones", {}),
        bad: useView<number>("zone", { zoneId: 0 }),
      }),
      { wrapper },
    );
    expect(result.current.zones).toEqual([]);
    expect(result.current.bad).toBeNull();
  });
});
