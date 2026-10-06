// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaceholderScreen } from "./PlaceholderScreen";

afterEach(cleanup);

describe("PlaceholderScreen", () => {
  it("names the screen and the task that delivers it", () => {
    render(<PlaceholderScreen title="Flow" task="6.5" />);
    expect(screen.getByRole("heading", { name: "Flow" })).toBeTruthy();
    expect(screen.getByText(/plan task 6\.5/)).toBeTruthy();
  });
});
