// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { StockpileInspection } from "./StockpileInspection";

afterEach(cleanup);

describe("StockpileInspection", () => {
  it("shows priority, accepted goods, contents with weights and the slots", () => {
    const host = startedHost();
    renderPanel(<StockpileInspection entityId={firstEntityOf(host, "chest")} />, host);
    expect(screen.getByRole("heading", { name: "chest" })).toBeTruthy();
    expect(screen.getByText("Priority")).toBeTruthy();
    expect(screen.getByText(/Stone block x16/)).toBeTruthy();
    expect(screen.getByText(/Slots 4 of 16/)).toBeTruthy();
  });

  it("says a missing storage is gone", () => {
    const host = startedHost();
    renderPanel(<StockpileInspection entityId={99999} />, host);
    expect(screen.getByText("This storage is gone.")).toBeTruthy();
  });
});
