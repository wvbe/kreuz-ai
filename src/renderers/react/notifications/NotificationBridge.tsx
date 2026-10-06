import { useEffect } from "react";
import type { MomentView } from "../../../game/chronicle/chronicleViews";
import type { EngineHost } from "../engine/EngineHost";
import { useEngineHost } from "../engine/useEngineHost";
import { Screen } from "../navigation/Screen";
import { openChronicle, openCitizenJournal } from "../views/chronicleRequests";
import { focusEntity, focusSubject } from "../views/focusSubject";
import { NotificationCenter } from "./NotificationCenter";
import type { NotificationActions } from "./NotificationCenter";

/**
 * Builds the click actions of the toasts over a host.
 *
 * @param host - The engine host.
 * @returns The actions.
 */
export function createNotificationActions(host: EngineHost): NotificationActions {
  return {
    focusEntity: (entityId) => focusEntity(host, entityId),
    focusSubject: (subject) => focusSubject(host, subject),
    openChronicle: () => openChronicle(host),
    openCitizenJournal: (entityId) => {
      if (!focusEntity(host, entityId)) {
        openCitizenJournal(host, entityId);
      }
    },
    openProgress: () => host.navigation.navigate(Screen.Progress),
    openIdleBlocked: () => host.navigation.navigate(Screen.IdleBlocked),
    momentText: (tick, momentId) => {
      // Straight to the session: this runs inside a tick, before the store's version moves on.
      const result = host.session.query.run("moments-since", { tick });
      if (!result.ok || !Array.isArray(result.data)) {
        return null;
      }
      // The `moments-since` query returns a list of MomentView.
      // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query name
      const moments = result.data as unknown as readonly MomentView[];
      return moments.find((moment) => moment.momentId === momentId)?.text ?? null;
    },
  };
}

/**
 * Renders nothing; while mounted it listens to the engine events and turns them into toasts
 * through a {@link NotificationCenter}. `ToastHost` mounts it once.
 *
 * @returns Nothing.
 */
export function NotificationBridge() {
  const host = useEngineHost();
  useEffect(() => {
    const center = new NotificationCenter({
      toasts: host.toasts,
      getPrefs: () => host.getPrefs(),
      actions: createNotificationActions(host),
    });
    return host.session.events.subscribe("**", (record) => center.handle(record));
  }, [host]);
  return null;
}
