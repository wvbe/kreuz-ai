// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { useSender } from "./useSender";

afterEach(cleanup);

function startedHost(): EngineHost {
  const host = new EngineHost();
  host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
  return host;
}

function wrapperOf(host: EngineHost) {
  return (props: { children: ReactNode }) =>
    createElement(EngineProvider, { host, children: props.children });
}

describe("useSender", () => {
  it("sends a command and keeps the structured errors of a refusal as field errors", () => {
    const host = startedHost();
    const { result } = renderHook(() => useSender(), { wrapper: wrapperOf(host) });
    let accepted = true;
    act(() => {
      accepted = result.current.send({
        kind: "CreateProductionOrder",
        recipeId: "bake_bread",
        quantity: 0,
      });
    });
    expect(accepted).toBe(false);
    expect(result.current.errors["quantity"]).toBeDefined();
    expect(host.toasts.getSnapshot().toasts.length).toBe(1);
    act(() => {
      accepted = result.current.send({
        kind: "DesignateZone",
        zoneTypeId: "stockpile",
        mapId: 1,
        cells: [257],
      });
    });
    expect(accepted).toBe(true);
    expect(result.current.errors).toEqual({});
  });

  it("shows the errors of a form that built no command without sending", () => {
    const host = startedHost();
    const { result } = renderHook(() => useSender(), { wrapper: wrapperOf(host) });
    act(() => {
      result.current.sendForm({ ok: false, errors: { quantity: "Enter a whole number" } });
    });
    expect(result.current.errors).toEqual({ quantity: "Enter a whole number" });
    expect(host.session.query.pendingCommands().commands).toHaveLength(0);
    act(() => {
      result.current.sendForm({
        ok: true,
        command: { kind: "DesignateZone", zoneTypeId: "stockpile", mapId: 1, cells: [257] },
      });
    });
    expect(result.current.errors).toEqual({});
    expect(host.session.query.pendingCommands().commands).toHaveLength(1);
    act(() => {
      result.current.sendForm({ ok: false, errors: { cells: "bad" } });
      result.current.clear();
    });
    expect(result.current.errors).toEqual({});
  });
});
