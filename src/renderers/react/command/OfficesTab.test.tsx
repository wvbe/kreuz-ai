// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- tests read typed views out of query JSON */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TownCrierView } from "../../../game/crier/crierViews";
import type { StewardView } from "../../../game/standing/standingViews";
import { EngineProvider } from "../engine/EngineProvider";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import { useSettlers } from "./OfficesTab";
import type { Settler } from "./OfficesTab";
import type { RenderedApp } from "../testing/renderApp";

afterEach(cleanup);

function step(app: RenderedApp): void {
  act(() => {
    app.host.step(1);
  });
}

function open(app: RenderedApp): HTMLElement {
  act(() => {
    app.host.navigation.navigate(Screen.StandingOrders);
  });
  fireEvent.click(screen.getByRole("tab", { name: "Steward and Town Crier" }));
  return screen.getByRole("tabpanel");
}

function steward(app: RenderedApp): StewardView {
  const result = app.host.store.query("steward", {});
  if (!result.ok) {
    throw new Error("no steward");
  }
  return result.data as unknown as StewardView;
}

function criers(app: RenderedApp): readonly TownCrierView[] {
  const result = app.host.store.query("town-criers", {});
  return result.ok ? (result.data as unknown as readonly TownCrierView[]) : [];
}

describe("useSettlers", () => {
  it("lists the settlers of the active map with their names", () => {
    const app = renderApp();
    app.start();
    const seen: Settler[][] = [];
    function Probe() {
      seen.push([...useSettlers()]);
      return null;
    }
    render(
      <EngineProvider host={app.host}>
        <Probe />
      </EngineProvider>,
    );
    expect(seen[seen.length - 1]?.length).toBe(6);
    expect(seen[seen.length - 1]?.[0]?.label).toMatch(/\(#\d+\)$/);
  });
});

describe("OfficesTab", () => {
  it("appoints and dismisses the Steward and asks for a review", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    const stewardSection = within(panel).getByRole("region", { name: "Steward" });
    const options = within(stewardSection).getAllByRole("option");
    // The first option is the placeholder; settlers follow, then the board choices.
    const settler = options.find((option) => /#\d+\)$/.test(option.textContent ?? ""));
    expect(settler).toBeDefined();
    const settlerId = Number((settler as HTMLOptionElement).value);
    fireEvent.change(within(stewardSection).getByLabelText("Settler"), {
      target: { value: String(settlerId) },
    });
    fireEvent.click(within(stewardSection).getByRole("button", { name: "Appoint Steward" }));
    step(app);
    expect(steward(app).stewardEntityId).toBe(settlerId);

    fireEvent.click(within(stewardSection).getByRole("button", { name: "Request review" }));
    step(app);
    expect(app.host.session.commandLog.map((entry) => entry.command.kind)).toContain(
      "RequestStewardReview",
    );

    fireEvent.click(within(stewardSection).getByRole("button", { name: "Dismiss Steward" }));
    step(app);
    expect(steward(app).stewardEntityId).toBeNull();
  });

  it("sets the board of the Steward", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    const boardSelect = within(panel).getByLabelText("Steward posts on board");
    const boardOption = within(boardSelect)
      .getAllByRole("option")
      .find((option) => (option as HTMLOptionElement).value !== "");
    fireEvent.change(boardSelect, { target: { value: (boardOption as HTMLOptionElement).value } });
    step(app);
    expect(steward(app).stewardBoardId).toBe(Number((boardOption as HTMLOptionElement).value));
  });

  it("appoints and dismisses a Town Crier", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    const before = criers(app).map((crier) => crier.crierId);
    const section = within(panel).getByRole("region", { name: "Town Criers" });
    const candidate = within(section)
      .getAllByRole("option")
      .map((option) => Number((option as HTMLOptionElement).value))
      .find((id) => id > 0 && !before.includes(id));
    expect(candidate).toBeDefined();
    fireEvent.change(within(section).getByLabelText("Settler to appoint"), {
      target: { value: String(candidate) },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Appoint Town Crier" }));
    step(app);
    expect(criers(app).map((crier) => crier.crierId)).toContain(candidate);

    fireEvent.click(within(section).getAllByRole("button", { name: "Dismiss" })[0] as HTMLElement);
    step(app);
    expect(criers(app).length).toBeLessThan(before.length + 1);
  });
});
/* eslint-enable no-restricted-syntax -- end of the test file */
