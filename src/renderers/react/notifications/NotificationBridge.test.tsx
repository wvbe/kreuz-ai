// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import { createNotificationActions, NotificationBridge } from "./NotificationBridge";

afterEach(cleanup);

describe("NotificationBridge", () => {
  it("listens to every event while mounted and stops when unmounted", () => {
    const host = new EngineHost();
    const unsubscribe = vi.fn();
    const subscribe = vi.spyOn(host.session.events, "subscribe").mockReturnValue(unsubscribe);
    const view = render(
      <EngineProvider host={host}>
        <NotificationBridge />
      </EngineProvider>,
    );
    expect(subscribe).toHaveBeenCalledWith("**", expect.any(Function));
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("builds actions that focus, read moments and navigate", () => {
    const app = renderApp();
    app.start();
    const actions = createNotificationActions(app.host);
    expect(actions.focusEntity(3)).toBe(true);
    expect(actions.focusSubject({ kind: "Citizen", id: 3 })).toBe(true);
    expect(actions.momentText(0, 1)).toContain("has come to the hamlet");
    expect(actions.momentText(0, 999_999)).toBeNull();
    actions.openProgress();
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.Progress);
    actions.openIdleBlocked();
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.IdleBlocked);
    actions.openCitizenJournal(3);
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.Map);
    actions.openCitizenJournal(999_999);
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.Chronicle);
    actions.openChronicle();
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.Chronicle);
  });
});
