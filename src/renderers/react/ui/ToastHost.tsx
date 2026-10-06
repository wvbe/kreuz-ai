import { useEngineHost } from "../engine/useEngineHost";
import { useStore } from "../engine/useStore";

/**
 * Shows the toasts of the host (spec 024 FR-028); each can be dismissed, and game time expires
 * them.
 *
 * @returns The toast stack.
 */
export function ToastHost() {
  const host = useEngineHost();
  const { toasts } = useStore(host.toasts);
  return (
    <div className="kv-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`kv-toast kv-toast-${toast.kind}`}>
          <span>{toast.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => host.toasts.dismiss(toast.id)}>
            x
          </button>
        </div>
      ))}
    </div>
  );
}
