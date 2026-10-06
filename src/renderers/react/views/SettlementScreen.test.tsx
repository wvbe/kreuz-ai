// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../testing/renderApp";
import { SettlementScreen } from "./SettlementScreen";

afterEach(cleanup);

describe("SettlementScreen", () => {
  it("is routed from the menu, and the other 6.5 screens replace their placeholders", () => {
    expect(SettlementScreen).toBeTypeOf("function");
    const app = renderApp();
    app.start();
    for (const [label, heading] of [
      ["Settlement", "Settlement"],
      ["Flow", "Production flow"],
      ["Idle and blocked", "Idle and blocked"],
      ["Chronicle", "Chronicle"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("heading", { name: heading, level: 2 })).toBeTruthy();
      expect(screen.queryByText(/arrives with plan task/)).toBeNull();
    }
  });
});
