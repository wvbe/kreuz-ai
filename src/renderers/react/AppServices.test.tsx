// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppServices } from "./AppServices";

afterEach(cleanup);

describe("useAppServices", () => {
  it("throws outside an App", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Naked() {
      useAppServices();
      return null;
    }
    expect(() => render(<Naked />)).toThrow(/App above/);
    quiet.mockRestore();
  });
});
