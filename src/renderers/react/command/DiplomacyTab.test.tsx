// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- tests read typed views out of query JSON */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EnvoyView } from "../../../game/diplomacy/diplomacyViews";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";

afterEach(cleanup);

const abbey = "Abbey of St Wulfric";

function step(app: RenderedApp): void {
  act(() => {
    app.host.step(1);
  });
}

function open(app: RenderedApp): HTMLElement {
  act(() => {
    app.host.navigation.navigate(Screen.StandingOrders);
  });
  fireEvent.click(screen.getByRole("tab", { name: "Diplomacy" }));
  return screen.getByRole("tabpanel");
}

function directives(app: RenderedApp): readonly EnvoyView[] {
  const result = app.host.store.query("directives", {});
  return result.ok ? (result.data as unknown as readonly EnvoyView[]) : [];
}

describe("DiplomacyTab", () => {
  it("lists the factions with both attitudes", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    const row = within(panel).getByText(abbey).closest("tr") as HTMLElement;
    expect(within(row).getAllByText(/friendly \(/).length).toBe(2);
    expect(within(panel).getByText("No proposals waiting.")).toBeTruthy();
  });

  // @covers 024:FR-010
  it("sends a gift envoy and cancels the directive", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    fireEvent.click(within(panel).getByRole("button", { name: `Envoy to ${abbey}` }));
    const form = within(panel).getByRole("form", { name: `Gift to ${abbey}` });
    fireEvent.change(within(form).getByLabelText("Gift coins"), { target: { value: "50" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send gift" }));
    step(app);
    expect(directives(app)).toEqual([
      expect.objectContaining({ actType: "gift", targetName: abbey, giftValueCoins: 50 }),
    ]);
    expect(within(panel).getByText(/#\d+ gift to Abbey of St Wulfric/)).toBeTruthy();

    fireEvent.click(within(panel).getAllByRole("button", { name: "Cancel" })[0] as HTMLElement);
    step(app);
    expect(directives(app).filter((envoy) => envoy.status === "outbound")).toHaveLength(0);
  });

  it("sends an overture and a declaration", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    fireEvent.click(within(panel).getByRole("button", { name: `Envoy to ${abbey}` }));
    fireEvent.click(within(panel).getByRole("button", { name: "Overture" }));
    step(app);
    fireEvent.click(within(panel).getByRole("button", { name: "Declare peace" }));
    step(app);
    expect(
      directives(app)
        .map((envoy) => envoy.actType)
        .sort(),
    ).toEqual(["declaration", "overture"]);
  });

  it("refuses an empty gift beside the field without sending", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    fireEvent.click(within(panel).getByRole("button", { name: `Envoy to ${abbey}` }));
    const form = within(panel).getByRole("form", { name: `Gift to ${abbey}` });
    fireEvent.click(within(form).getByRole("button", { name: "Send gift" }));
    expect(within(form).getByText("Send coins or goods")).toBeTruthy();
    step(app);
    expect(directives(app)).toHaveLength(0);
  });
});
/* eslint-enable no-restricted-syntax -- end of the test file */
