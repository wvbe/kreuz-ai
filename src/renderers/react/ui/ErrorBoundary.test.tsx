// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);

function Bomb(props: { explode: boolean }) {
  if (props.explode) {
    throw new Error("kaboom");
  }
  return <p>fine</p>;
}

function Harness(props: { onError: (error: Error) => void }) {
  const [explode, setExplode] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setExplode(false)}>
        defuse
      </button>
      <ErrorBoundary onError={props.onError}>
        <Bomb explode={explode} />
      </ErrorBoundary>
    </>
  );
}

describe("ErrorBoundary", () => {
  it("shows the message, reports the error once and recovers on retry", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const errors: string[] = [];
    render(<Harness onError={(error) => errors.push(error.message)} />);
    expect(screen.getByRole("alert").textContent).toContain("kaboom");
    expect(errors).toEqual(["kaboom"]);
    fireEvent.click(screen.getByRole("button", { name: "defuse" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("fine")).toBeTruthy();
    quiet.mockRestore();
  });

  it("renders its children when nothing fails", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeTruthy();
  });
});
