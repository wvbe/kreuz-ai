// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Checklist } from "./Checklist";

afterEach(cleanup);

describe("Checklist", () => {
  it("marks met and open items and shows the detail of an open one", () => {
    render(
      <Checklist
        items={[
          { label: "A door", met: true },
          { label: "A bed", met: false, detail: "0 of 1" },
        ]}
      />,
    );
    expect(screen.getByText("A door").closest("li")?.getAttribute("data-met")).toBe("true");
    expect(screen.getByText("A bed").closest("li")?.getAttribute("data-met")).toBe("false");
    expect(screen.getByText("0 of 1")).toBeTruthy();
  });
});
