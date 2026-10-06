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
   * @returns The id, for {@link ToastStore.dismiss}.
   */
  push(kind: ToastKind, text: string, expiresAtTick: number | null = null): number {
    const id = this.nextId;
    this.nextId += 1;
    this.replace({ toasts: [...this.getSnapshot().toasts, { id, kind, text, expiresAtTick }] });
    return id;
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
