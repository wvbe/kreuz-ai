// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToastKind } from "../engine/ToastStore";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

describe("ToastHost", () => {
  it("renders pushed toasts by kind and removes them when game time expires them", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.toasts.push(ToastKind.Warning, "careful", 2);
      app.host.toasts.push(ToastKind.Info, "kept");
    });
    expect(screen.getByText("careful").parentElement?.className).toContain("kv-toast-warning");
    act(() => {
      app.host.step(2);
    });
    expect(screen.queryByText("careful")).toBeNull();
    expect(screen.getByText("kept")).toBeTruthy();
  });
});
