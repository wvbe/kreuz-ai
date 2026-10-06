// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeyValueList } from "./KeyValueList";

afterEach(cleanup);

describe("KeyValueList", () => {
  it("shows label and value rows and skips null rows", () => {
    render(
      <KeyValueList rows={[{ label: "Kind", value: "oven" }, null, { label: "Id", value: 7 }]} />,
    );
    expect(screen.getByText("Kind")).toBeTruthy();
    expect(screen.getByText("oven")).toBeTruthy();
    expect(screen.getAllByRole("term")).toHaveLength(2);
  });
});
