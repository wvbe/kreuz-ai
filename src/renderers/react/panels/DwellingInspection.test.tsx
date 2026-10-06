// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildDwellingRoom, renderPanel, startedHost } from "../testing/renderPanel";
import { DwellingInspection } from "./DwellingInspection";

afterEach(cleanup);

describe("DwellingInspection", () => {
  it("shows the level, streaks and the checklists of a dwelling", () => {
    const host = startedHost("village");
    const { zone } = buildDwellingRoom(host, true);
    renderPanel(<DwellingInspection entityId={zone} />, host);
    expect(screen.getByRole("heading", { name: /^Dwelling:/ })).toBeTruthy();
    expect(screen.getByText("Upgrade streak")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^To keep/ })).toBeTruthy();
    expect(document.querySelectorAll(".kv-checklist li").length).toBeGreaterThan(0);
  });

  it("falls back to the zone view, with its open requirement, while the room is incomplete", () => {
    const host = startedHost("village");
    const { zone } = buildDwellingRoom(host, false);
    renderPanel(<DwellingInspection entityId={zone} />, host);
    expect(screen.getByRole("heading", { name: /Dwelling zone/i })).toBeTruthy();
    expect(screen.getByText(/1 bed/).closest("li")?.getAttribute("data-met")).toBe("false");
  });
});
