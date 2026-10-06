// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StackList } from "./StackList";

afterEach(cleanup);

describe("StackList", () => {
  it("shows quantities, total weights and the capacity", () => {
    render(
      <StackList
        stacks={[{ materialId: "oak_plank", quantity: 3, unitWeightMilli: 2000 }]}
        slotCount={8}
        weightLimitMilli={20000}
      />,
    );
    expect(screen.getByText(/oak plank x3/)).toBeTruthy();
    expect(screen.getByText("6.0")).toBeTruthy();
    expect(screen.getByText(/Slots 1 of 8/)).toBeTruthy();
    expect(screen.getByText(/Weight 6.0 of 20.0/)).toBeTruthy();
  });

  it("says when it is empty", () => {
    render(<StackList stacks={[]} emptyText="Carrying nothing." />);
    expect(screen.getByText("Carrying nothing.")).toBeTruthy();
  });

  it("shows notes after the quantity", () => {
    render(<StackList stacks={[{ materialId: "nails", quantity: 2, note: "of 5" }]} />);
    expect(screen.getByText("of 5")).toBeTruthy();
  });
});
