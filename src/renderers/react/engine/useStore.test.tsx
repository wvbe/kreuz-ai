// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SelectionStore } from "../selection/SelectionStore";
import { useStore } from "./useStore";

afterEach(cleanup);

describe("useStore", () => {
  it("re-renders when the store changes", () => {
    const store = new SelectionStore();
    function Probe() {
      const state = useStore(store);
      return <p data-testid="cell">{String(state.cell)}</p>;
    }
    render(<Probe />);
    expect(screen.getByTestId("cell").textContent).toBe("null");
    act(() => {
      store.selectCell(9);
    });
    expect(screen.getByTestId("cell").textContent).toBe("9");
  });
});
