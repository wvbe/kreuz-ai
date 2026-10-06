// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildBlockedBakery,
  buildDwellingRoom,
  firstEntityOf,
  renderPanel,
  startedHost,
} from "./renderPanel";

afterEach(cleanup);

describe("renderPanel helpers", () => {
  it("starts a game and renders a component that reads it", () => {
    const host = startedHost();
    renderPanel(<p>ready</p>, host);
    expect(screen.getByText("ready")).toBeTruthy();
    expect(firstEntityOf(host, "peasant")).toBeGreaterThan(0);
    expect(() => firstEntityOf(host, "no_such_prototype")).toThrow();
  });

  it("builds the blocked bakery and the dwelling room", () => {
    const bakery = startedHost("village");
    const { oven, mill, zone } = buildBlockedBakery(bakery);
    const explained = bakery.session.query.run("explain", { id: oven });
    expect(explained.ok && explained.data !== null).toBe(true);
    expect(new Set([oven, mill, zone]).size).toBe(3);
    const room = startedHost("village");
    expect(buildDwellingRoom(room, true).zone).toBeGreaterThan(0);
  });
});
