// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

afterEach(cleanup);

describe("Tabs", () => {
  it("shows the first tab and switches content on click", () => {
    render(
      <Tabs
        tabs={[
          { id: "one", label: "One", render: () => <p>first body</p> },
          { id: "two", label: "Two", render: () => <p>second body</p> },
        ]}
      />,
    );
    expect(screen.getByText("first body")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "One" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(screen.getByText("second body")).toBeTruthy();
    expect(screen.queryByText("first body")).toBeNull();
  });
});
