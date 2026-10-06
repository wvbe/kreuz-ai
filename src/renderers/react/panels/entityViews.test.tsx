// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { componentOf, useMaterialInfo } from "./entityViews";
import type { InventoryData } from "./entityViews";

afterEach(cleanup);

function Weights(props: { ids: readonly string[] }) {
  const info = useMaterialInfo(props.ids);
  return (
    <p>
      {props.ids
        .map((id) => `${id}=${info.get(id)?.name ?? "?"}:${info.get(id)?.weightMilli ?? 0}`)
        .join(" ")}
    </p>
  );
}

describe("entityViews", () => {
  it("reads a component of an entity view", () => {
    const host = startedHost();
    const detail = host.session.query.entity(firstEntityOf(host, "peasant"));
    if (detail === null) {
      throw new Error("no peasant");
    }
    const inventory: InventoryData | undefined = componentOf<InventoryData>(detail, "Inventory");
    expect(inventory?.slotCount).toBe(8);
    expect(componentOf<InventoryData>(detail, "NoSuchComponent")).toBeUndefined();
  });

  it("looks up material names and weights, skipping unknown ids", () => {
    const host = startedHost();
    renderPanel(<Weights ids={["oak_plank", "nope"]} />, host);
    expect(screen.getByText(/oak_plank=Oak plank:2000 nope=\?:0/)).toBeTruthy();
  });
});
