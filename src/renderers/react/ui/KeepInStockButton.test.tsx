// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setStandingOrderFormOpener } from "../views/standingOrderRequests";
import { KeepInStockButton } from "./KeepInStockButton";

afterEach(() => {
  cleanup();
  setStandingOrderFormOpener(null);
});

describe("KeepInStockButton", () => {
  // @covers 024:FR-030
  it("asks for the standing-order form of its material", () => {
    const asked: string[] = [];
    setStandingOrderFormOpener((materialId) => asked.push(materialId));
    render(<KeepInStockButton materialId="oak_plank" />);
    fireEvent.click(screen.getByRole("button", { name: "Keep oak plank in stock" }));
    expect(asked).toEqual(["oak_plank"]);
  });

  it("uses the given name in its label", () => {
    render(<KeepInStockButton materialId="oak_plank" name="Oak plank" />);
    expect(screen.getByRole("button", { name: "Keep Oak plank in stock" })).toBeTruthy();
  });
});
