// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { Screen } from "../navigation/Screen";
import { chronicleRequests } from "../views/chronicleRequests";
import { ChronicleScreen } from "../views/ChronicleScreen";
import { FlowScreen } from "../views/FlowScreen";
import { IdleBlockedScreen } from "../views/IdleBlockedScreen";
import { SettlementScreen } from "../views/SettlementScreen";
import { setStandingOrderFormOpener } from "../views/standingOrderRequests";
import { loadScenarioForHost, playScenarioOnHost } from "./playScenarioOnHost";

// Task 6.6: scenario files of the repo run through the EngineHost (the path every UI control
// uses) must end in the state hash the in-process runner reports, and the screens of task 6.5
// must show the result. No wall-clock assertions; the timeouts only leave room for a loaded
// machine.
const generousTimeout = 600_000;
const play = playScenarioOnHost;

function show(host: EngineHost, screenElement: React.ReactElement): void {
  render(<EngineProvider host={host}>{screenElement}</EngineProvider>);
}

afterEach(() => {
  cleanup();
  setStandingOrderFormOpener(null);
  chronicleRequests.clear();
});

describe("UI smoke: scenarios through the EngineHost", () => {
  it("loads only the command and step steps of a scenario", () => {
    const scenario = loadScenarioForHost("checkpoint-c");
    expect(scenario.steps.length).toBeGreaterThan(10);
    expect(scenario.steps.every((step) => "command" in step || "step" in step)).toBe(true);
  });

  for (const name of ["checkpoint-c", "standing-orders", "chronicle", "fauna", "why-flow"]) {
    it(`${name} ends in the hash of the in-process runner`, { timeout: generousTimeout }, () => {
      const entry = play(name);
      expect(entry.hash).toBe(entry.cliHash);
      expect(entry.tick).toBeGreaterThan(0);
    });
  }

  it(
    "hamlet-to-village (slow) ends in the same hash, the village toast was raised",
    { timeout: generousTimeout },
    () => {
      const entry = play("hamlet-to-village");
      expect(entry.hash).toBe(entry.cliHash);
      expect([...entry.toastTexts].some((text) => text.includes("Village"))).toBe(true);
    },
  );
});

describe("UI smoke: the views against the resulting state", () => {
  it("the flow view shows bread consumed after checkpoint C", { timeout: generousTimeout }, () => {
    show(play("checkpoint-c").host, <FlowScreen />);
    const bread = document.querySelector('tr[data-material="bread"]');
    expect(bread).not.toBeNull();
    const cells = bread?.querySelectorAll("td") ?? [];
    expect(cells[1]?.textContent).not.toBe("0.0");
    expect(cells[2]?.textContent).not.toBe("0.0");
    expect(screen.getByRole("heading", { name: "Production flow" })).toBeTruthy();
  });

  it(
    "the idle and blocked list groups by reason and focuses a zone",
    {
      timeout: generousTimeout,
    },
    () => {
      const { host } = play("why-flow");
      show(host, <IdleBlockedScreen />);
      const group = screen.getByRole("region", { name: "Zone requirements unmet" });
      const rowButton = within(group).getAllByRole("button")[0];
      expect(rowButton?.textContent).toContain("Zone");
      host.navigation.navigate(Screen.IdleBlocked);
      act(() => rowButton?.click());
      expect(host.selection.getSnapshot().focus).not.toBeNull();
      expect(host.navigation.getSnapshot().screen).toBe(Screen.Map);
    },
  );

  it(
    "the chronicle shows took_office after the chronicle scenario",
    {
      timeout: generousTimeout,
    },
    () => {
      chronicleRequests.clear();
      show(play("chronicle").host, <ChronicleScreen />);
      expect(
        document.querySelectorAll('li[data-kind="took_office"]').length,
      ).toBeGreaterThanOrEqual(2);
    },
  );

  it(
    "shows TierReached in the chronicle and Village in the progress panel",
    {
      timeout: generousTimeout,
    },
    () => {
      const { host } = play("hamlet-to-village");
      chronicleRequests.clear();
      show(host, <ChronicleScreen />);
      expect(
        document.querySelectorAll('li[data-kind="tier_reached"]').length,
      ).toBeGreaterThanOrEqual(1);
      cleanup();
      show(host, <SettlementScreen />);
      expect(screen.getByText("Village", { selector: "strong" })).toBeTruthy();
      expect(screen.getByRole("list", { name: "Milestones" })).toBeTruthy();
    },
  );

  it(
    "the flow view expands a row into its sources and hands the material to the order form",
    {
      timeout: generousTimeout,
    },
    () => {
      const asked: string[] = [];
      setStandingOrderFormOpener((materialId) => asked.push(materialId));
      show(play("checkpoint-c").host, <FlowScreen />);
      fireEvent.click(screen.getByRole("button", { name: "Show sources of bread" }));
      expect(screen.getByText(/Produced by source:/)).toBeTruthy();
      expect(screen.getAllByText("Recipe").length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: "Keep bread in stock" }));
      expect(asked).toEqual(["bread"]);
      fireEvent.click(screen.getByRole("button", { name: "Hide sources of bread" }));
      expect(screen.queryByText(/Produced by source:/)).toBeNull();
    },
  );

  it(
    "the idle and blocked list can include the subjects still settling",
    {
      timeout: generousTimeout,
    },
    () => {
      show(play("fauna").host, <IdleBlockedScreen />);
      const before = document.querySelectorAll("li").length;
      fireEvent.click(screen.getByRole("checkbox"));
      expect(document.querySelectorAll("li").length).toBeGreaterThanOrEqual(before);
    },
  );

  it(
    "the chronicle filters by kind and citizen and shows a citizen's journal",
    {
      timeout: generousTimeout,
    },
    () => {
      show(play("chronicle").host, <ChronicleScreen />);
      const all = document.querySelectorAll("li[data-kind]").length;
      expect(all).toBeGreaterThan(2);
      fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "took_office" } });
      const offices = document.querySelectorAll("li[data-kind]");
      expect(offices.length).toBeGreaterThanOrEqual(2);
      expect([...offices].every((entry) => entry.getAttribute("data-kind") === "took_office")).toBe(
        true,
      );
      fireEvent.click(screen.getAllByRole("button", { name: "Journal" })[0] as HTMLElement);
      expect((screen.getByLabelText("Citizen id") as HTMLInputElement).value).not.toBe("");
      expect(screen.getByText(/entries\./)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(document.querySelectorAll("li[data-kind]").length).toBe(all);
    },
  );

  it(
    "the settlement panel shows the next tier's checklist and what it unlocks",
    {
      timeout: generousTimeout,
    },
    () => {
      show(play("checkpoint-c").host, <SettlementScreen />);
      expect(screen.getByText("Hamlet", { selector: "strong" })).toBeTruthy();
      const checklist = screen.getByRole("list", { name: "Next tier requirements" });
      expect(within(checklist).getAllByRole("progressbar").length).toBeGreaterThan(0);
      expect(screen.getByRole("list", { name: "Unlocks preview" })).toBeTruthy();
    },
  );
});
