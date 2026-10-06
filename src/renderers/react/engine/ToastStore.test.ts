import { describe, expect, it } from "vitest";
import { ToastKind, ToastStore } from "./ToastStore";

describe("ToastStore", () => {
  it("pushes, dismisses and ignores unknown ids", () => {
    const store = new ToastStore();
    const first = store.push(ToastKind.Info, "one");
    const second = store.push(ToastKind.Error, "two");
    expect(store.getSnapshot().toasts.map((toast) => toast.text)).toEqual(["one", "two"]);
    const before = store.getSnapshot();
    store.dismiss(99);
    expect(store.getSnapshot()).toBe(before);
    store.dismiss(first);
    expect(store.getSnapshot().toasts.map((toast) => toast.id)).toEqual([second]);
  });

  it("expires by game tick only", () => {
    const store = new ToastStore();
    store.push(ToastKind.Info, "short", 10);
    store.push(ToastKind.Warning, "sticky");
    store.expire(9);
    expect(store.getSnapshot().toasts).toHaveLength(2);
    store.expire(10);
    expect(store.getSnapshot().toasts.map((toast) => toast.text)).toEqual(["sticky"]);
  });

  it("updates the text of a shown toast and keeps its action", () => {
    const store = new ToastStore();
    const act = (): void => undefined;
    const id = store.push(ToastKind.Info, "one", 5, act);
    store.update(id, "two");
    store.update(99, "ignored");
    expect(store.getSnapshot().toasts).toMatchObject([
      { text: "two", expiresAtTick: 5, onActivate: act },
    ]);
    store.update(id, "three", 9);
    expect(store.getSnapshot().toasts[0]?.expiresAtTick).toBe(9);
  });
});
