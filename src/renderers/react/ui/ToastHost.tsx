import { useEngineHost } from "../engine/useEngineHost";
import { useStore } from "../engine/useStore";
import { NotificationBridge } from "../notifications/NotificationBridge";

/**
 * Shows the toasts of the host (spec 024 FR-028); each can be dismissed, and game time expires
 * them. A toast with an action (focus its subject, open the chronicle) is a button. It also mounts
 * the `NotificationBridge` that turns engine events into toasts.
 *
 * @returns The toast stack.
 */
export function ToastHost() {
  const host = useEngineHost();
  const { toasts } = useStore(host.toasts);
  return (
    <div className="kv-toasts" role="status" aria-live="polite">
      <NotificationBridge />
      {toasts.map((toast) => (
        <div key={toast.id} className={`kv-toast kv-toast-${toast.kind}`}>
          {toast.onActivate === null ? (
            <span>{toast.text}</span>
          ) : (
            <button type="button" className="kv-toast-action" onClick={toast.onActivate}>
              {toast.text}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => host.toasts.dismiss(toast.id)}>
            x
          </button>
        </div>
      ))}
    </div>
  );
}
