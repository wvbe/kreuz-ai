import { StoreBase } from "./StoreBase";

/**
 * Severity of a toast.
 */
export enum ToastKind {
  Info = "info",
  Warning = "warning",
  Error = "error",
}

/**
 * One notification.
 */
export type Toast = {
  id: number;
  kind: ToastKind;
  text: string;
  /**
   * Game tick after which the toast goes away by itself; null keeps it until dismissed. Toasts
   * expire with game time, never with a real timer, so a paused game keeps them readable.
   */
  expiresAtTick: number | null;
  /**
   * What clicking the toast does (focus its subject, open the chronicle); null for a toast that
   * is only text.
   */
  onActivate: (() => void) | null;
};

/**
 * State of the toast store.
 */
export type ToastState = {
  toasts: readonly Toast[];
};

/**
 * The toasts on screen (spec 024 FR-028, FR-036, FR-040): any part of the renderer pushes one,
 * the `ToastHost` component shows them.
 */
export class ToastStore extends StoreBase<ToastState> {
  private nextId = 1;

  /**
   * Creates an empty store.
   */
  constructor() {
    super({ toasts: [] });
  }

  /**
   * Shows a toast.
   *
   * @param kind - Severity.
   * @param text - Message.
   * @param expiresAtTick - Game tick after which it disappears, or null (default) for never.
   * @param onActivate - Called when the player clicks the toast (it then shows as a button).
   * @returns The id, for {@link ToastStore.dismiss}.
   */
  push(
    kind: ToastKind,
    text: string,
    expiresAtTick: number | null = null,
    onActivate: (() => void) | null = null,
  ): number {
    const id = this.nextId;
    this.nextId += 1;
    this.replace({
      toasts: [...this.getSnapshot().toasts, { id, kind, text, expiresAtTick, onActivate }],
    });
    return id;
  }

  /**
   * Changes the text (and optionally the expiry) of a toast that is still shown, for toasts that
   * count something up ("3 subjects blocked"); unknown ids are ignored.
   *
   * @param id - The id `push` returned.
   * @param text - The new message.
   * @param expiresAtTick - The new expiry; leave out to keep the old one.
   */
  update(id: number, text: string, expiresAtTick?: number | null): void {
    const toasts = this.getSnapshot().toasts;
    if (toasts.some((toast) => toast.id === id)) {
      this.replace({
        toasts: toasts.map((toast) =>
          toast.id === id
            ? { ...toast, text, expiresAtTick: expiresAtTick ?? toast.expiresAtTick }
            : toast,
        ),
      });
    }
  }

  /**
   * Removes a toast; unknown ids are ignored.
   *
   * @param id - The id `push` returned.
   */
  dismiss(id: number): void {
    const toasts = this.getSnapshot().toasts;
    if (toasts.some((toast) => toast.id === id)) {
      this.replace({ toasts: toasts.filter((toast) => toast.id !== id) });
    }
  }

  /**
   * Removes the toasts whose time has come.
   *
   * @param tick - The current game tick.
   */
  expire(tick: number): void {
    const toasts = this.getSnapshot().toasts;
    const kept = toasts.filter(
      (toast) => toast.expiresAtTick === null || toast.expiresAtTick > tick,
    );
    if (kept.length !== toasts.length) {
      this.replace({ toasts: kept });
    }
  }
}
