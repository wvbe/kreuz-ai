// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "./EngineHost";
import { EngineProvider } from "./EngineProvider";
import { useEngineHost } from "./useEngineHost";

afterEach(cleanup);

function Show() {
  return <p data-testid="running">{String(useEngineHost().isClockRunning())}</p>;
}

describe("EngineProvider", () => {
  it("makes the host available to its children", () => {
    render(
      <EngineProvider host={new EngineHost()}>
        <Show />
      </EngineProvider>,
    );
    expect(screen.getByTestId("running").textContent).toBe("false");
  });
});
