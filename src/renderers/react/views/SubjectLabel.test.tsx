// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { createFakeScheduler } from "../testing/fakeScheduler";
import { SubjectLabel } from "./SubjectLabel";

afterEach(cleanup);

function startedHost(): EngineHost {
  const host = new EngineHost({ scheduler: createFakeScheduler().scheduler });
  host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
  return host;
}

describe("SubjectLabel", () => {
  it("names a citizen by its styled name and others by kind and id", () => {
    render(
      <EngineProvider host={startedHost()}>
        <SubjectLabel subject={{ kind: "Citizen", id: 3 }} />
        <SubjectLabel subject={{ kind: "JobBoard", id: 2 }} />
      </EngineProvider>,
    );
    expect(screen.getByText(/Margery/)).toBeTruthy();
    expect(screen.getByText(/Job Board/)).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
  });
});
