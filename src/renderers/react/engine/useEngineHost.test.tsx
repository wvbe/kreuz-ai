// @vitest-environment jsdom
import { cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineHost } from "./EngineHost";
import { EngineProvider } from "./EngineProvider";
import { useEngineHost } from "./useEngineHost";

afterEach(cleanup);

describe("useEngineHost and EngineProvider", () => {
  it("returns the provided host", () => {
    const host = new EngineHost();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EngineProvider host={host}>{children}</EngineProvider>
    );
    const { result } = renderHook(() => useEngineHost(), { wrapper });
    expect(result.current).toBe(host);
  });

  it("throws without a provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Naked() {
      useEngineHost();
      return null;
    }
    expect(() => render(<Naked />)).toThrow(/EngineProvider/);
    quiet.mockRestore();
  });
});
