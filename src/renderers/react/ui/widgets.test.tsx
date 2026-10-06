// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { Checklist } from "./Checklist";
import { EntityLink, Link } from "./EntityLink";
import { KeyValueList } from "./KeyValueList";
import { NeedBar } from "./NeedBar";
import { StackList } from "./StackList";
import { Tabs } from "./Tabs";

afterEach(cleanup);

describe("shared widgets", () => {
  it("NeedBar exposes its value as a meter and clamps it", () => {
    render(<NeedBar label="Hunger" percent={140} critical />);
    const meter = screen.getByRole("meter", { name: "Hunger" });
    expect(meter.getAttribute("aria-valuenow")).toBe("100");
    expect(meter.getAttribute("data-critical")).toBe("true");
  });

  it("StackList shows quantities, total weights and the capacity", () => {
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

  it("StackList says when it is empty", () => {
    render(<StackList stacks={[]} emptyText="Carrying nothing." />);
    expect(screen.getByText("Carrying nothing.")).toBeTruthy();
  });

  it("KeyValueList skips null rows and Checklist marks met items", () => {
    render(
      <div>
        <KeyValueList rows={[{ label: "Kind", value: "oven" }, null]} />
        <Checklist
          items={[
            { label: "A door", met: true },
            { label: "A bed", met: false, detail: "0 of 1" },
          ]}
        />
      </div>,
    );
    expect(screen.getByText("Kind")).toBeTruthy();
    expect(screen.getByText("A door").closest("li")?.getAttribute("data-met")).toBe("true");
    expect(screen.getByText("A bed").closest("li")?.getAttribute("data-met")).toBe("false");
  });

  it("Link calls its handler and Tabs switch content", () => {
    let clicks = 0;
    render(
      <div>
        <Link
          label="Go"
          onClick={() => {
            clicks += 1;
          }}
        />
        <Tabs
          tabs={[
            { id: "one", label: "One", render: () => <p>first body</p> },
            { id: "two", label: "Two", render: () => <p>second body</p> },
          ]}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(clicks).toBe(1);
    expect(screen.getByText("first body")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(screen.getByText("second body")).toBeTruthy();
  });

  it("EntityLink selects the entity and centres the map on its cell", () => {
    const host = new EngineHost();
    act(() => {
      host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
    });
    const chest = host.session.query.entities({ prototype: "chest", limit: 1 }).entities[0];
    render(
      <EngineProvider host={host}>
        <EntityLink entityId={chest?.id ?? 0} label="the chest" />
      </EngineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "the chest" }));
    const selection = host.selection.getSnapshot();
    expect(selection.entityId).toBe(chest?.id);
    expect(selection.cell).not.toBeNull();
    expect(selection.focus?.cell).toBe(selection.cell);
  });
});
