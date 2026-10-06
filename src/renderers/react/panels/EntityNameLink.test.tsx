// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { EntityNameLink, useEntityName } from "./EntityNameLink";

afterEach(cleanup);

function Name(props: { entityId: number }) {
  return <p>{useEntityName(props.entityId)}</p>;
}

describe("EntityNameLink", () => {
  it("names a citizen by its styled name, an object by its prototype, a gone entity by id", () => {
    const host = startedHost();
    const peasant = firstEntityOf(host, "peasant");
    const identity = host.session.query.run("identity-of", { entityId: peasant });
    const styled = identity.ok ? (identity.data as { styledName: string }).styledName : "";
    renderPanel(
      <div>
        <Name entityId={peasant} />
        <Name entityId={firstEntityOf(host, "chest")} />
        <Name entityId={99999} />
        <EntityNameLink entityId={peasant} />
      </div>,
      host,
    );
    expect(screen.getAllByText(styled).length).toBe(2);
    expect(screen.getByText("chest")).toBeTruthy();
    expect(screen.getByText("#99999")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: styled }));
    expect(host.selection.getSnapshot().entityId).toBe(peasant);
  });
});
