// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NeedBar } from "./NeedBar";

afterEach(cleanup);

describe("NeedBar", () => {
  it("exposes its value as a meter and clamps it", () => {
    render(<NeedBar label="Hunger" percent={140} critical />);
    const meter = screen.getByRole("meter", { name: "Hunger" });
    expect(meter.getAttribute("aria-valuenow")).toBe("100");
    expect(meter.getAttribute("data-critical")).toBe("true");
  });

  it("shows custom value text", () => {
    render(<NeedBar label="Mood" percent={50} valueText="fine" />);
    expect(screen.getByText("fine")).toBeTruthy();
  });
});
