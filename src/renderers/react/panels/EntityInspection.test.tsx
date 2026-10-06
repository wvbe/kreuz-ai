// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildBlockedBakery,
  buildDwellingRoom,
  firstEntityOf,
  renderPanel,
  startedHost,
} from "../testing/renderPanel";
import { EntityInspection } from "./EntityInspection";

afterEach(cleanup);

describe("EntityInspection", () => {
  it("shows a character with tabs for overview, inventory and journal", () => {
    const host = startedHost();
    renderPanel(<EntityInspection entityId={firstEntityOf(host, "peasant")} />, host);
    expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Inventory" }));
    expect(screen.getByText(/Bread x2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Journal" }));
    expect(screen.getByText(/has come to the hamlet/)).toBeTruthy();
  });

  it("picks the view by what the entity is", () => {
    const host = startedHost("village");
    const { oven, zone } = buildBlockedBakery(host);
    const { unmount } = renderPanel(<EntityInspection entityId={oven} />, host);
    expect(document.querySelector('[data-kind="workstation"]')).not.toBeNull();
    unmount();
    renderPanel(<EntityInspection entityId={zone} />, host);
    expect(document.querySelector('[data-kind="zone"]')).not.toBeNull();
  });

  it("shows a dwelling room as a dwelling and a chest as a stockpile", () => {
    const host = startedHost("village");
    const { zone } = buildDwellingRoom(host, true);
    const { unmount } = renderPanel(<EntityInspection entityId={zone} />, host);
    expect(document.querySelector('[data-kind="dwelling"]')).not.toBeNull();
    unmount();
    renderPanel(<EntityInspection entityId={firstEntityOf(host, "chest")} />, host);
    expect(document.querySelector('[data-kind="stockpile"]')).not.toBeNull();
  });

  it("says when the entity is gone", () => {
    const host = startedHost();
    renderPanel(<EntityInspection entityId={99999} />, host);
    expect(screen.getByText("#99999 is gone.")).toBeTruthy();
  });
});
