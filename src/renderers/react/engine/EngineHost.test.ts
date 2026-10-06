import { describe, expect, it } from "vitest";
import { GameSession } from "../../../game/api/GameSession";
import { Screen } from "../navigation/Screen";
import { defaultRendererPrefs } from "../prefs/rendererPrefs";
import type { PrefsStorage } from "../prefs/rendererPrefs";
import { createFakeScheduler } from "../testing/fakeScheduler";
import { autosaveStorageKey, EngineHost } from "./EngineHost";
import type { NewGameOptions } from "./gameCommands";
import { ToastKind } from "./ToastStore";

const options: NewGameOptions = {
  seed: 42,
  difficulty: "steady",
  mapSize: 0,
  startingTier: "hamlet",
};

function memoryStorage(): PrefsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function startedHost(storage: PrefsStorage | null = null) {
  const fake = createFakeScheduler();
  const host = new EngineHost({ scheduler: fake.scheduler, storage });
  host.newGame(options);
  return { host, fake };
}

describe("EngineHost", () => {
  it("starts a game, starts the clock and runs one logged tick per timer callback", () => {
    const { host, fake } = startedHost();
    expect(host.session.hasGame).toBe(true);
    expect(host.isClockRunning()).toBe(true);
    const version = host.store.getSnapshot();
    fake.fireMany(3);
    expect(host.session.tick).toBe(3);
    expect(host.store.getSnapshot()).toBeGreaterThan(version);
    expect(host.session.commandLog.filter((entry) => entry.command.kind === "step")).toHaveLength(
      3,
    );
    host.dispose();
    expect(host.isClockRunning()).toBe(false);
  });

  it("does not start the clock without a game", () => {
    const fake = createFakeScheduler();
    const host = new EngineHost({ scheduler: fake.scheduler });
    host.startClock();
    expect(host.isClockRunning()).toBe(false);
  });

  it("maps pause, resume and speed to commands and re-reads the delay", () => {
    const { host, fake } = startedHost();
    host.commands.pause();
    expect(host.session.query.time().paused).toBe(true);
    fake.fireMany(2);
    expect(host.session.tick).toBe(0);
    host.commands.resume();
    host.commands.setSpeed(4000);
    expect(host.session.query.time().speed).toBe(4000);
    fake.fireMany(1);
    expect(host.session.tick).toBe(1);
    const last = fake.delays.at(-1) ?? 0;
    expect(last).toBeGreaterThan(0);
  });

  it("queued commands are applied by the paused clock without advancing time", () => {
    const { host, fake } = startedHost();
    host.commands.pause();
    host.dispatch({ kind: "DesignateZone", zoneTypeId: "stockpile", mapId: 1, cells: [257] });
    expect(host.session.query.pendingCommands().commands).toHaveLength(1);
    fake.fireMany(1);
    expect(host.session.query.pendingCommands().commands).toHaveLength(0);
    expect(host.session.tick).toBe(0);
  });

  it("reports failures as error toasts and results", () => {
    const { host } = startedHost();
    const result = host.dispatch({ kind: "nonsense" });
    expect(result.ok).toBe(false);
    expect(host.toasts.getSnapshot().toasts.at(-1)?.kind).toBe(ToastKind.Error);
    host.step(0);
    expect(host.toasts.getSnapshot().toasts.length).toBeGreaterThan(1);
  });

  it("toasts a rejected queued command", () => {
    const { host } = startedHost();
    host.dispatch({ kind: "DesignateZone", zoneTypeId: "no_such_zone", mapId: 1, cells: [1] });
    host.step(1);
    expect(
      host.toasts.getSnapshot().toasts.some((toast) => toast.text.startsWith("Command rejected")),
    ).toBe(true);
  });

  it("resets selection and goes to the map when a game is started or loaded", () => {
    const { host } = startedHost();
    host.selection.selectCell(5);
    host.navigation.navigate(Screen.Settings);
    const text = host.saveText();
    expect(text).not.toBeNull();
    host.navigation.navigate(Screen.Settings);
    expect(host.loadText(text ?? "").ok).toBe(true);
    expect(host.selection.getSnapshot().cell).toBeNull();
    expect(host.navigation.getSnapshot().screen).toBe(Screen.Map);
  });

  it("keeps the game when a load fails", () => {
    const { host } = startedHost();
    const hash = host.session.stateHash();
    expect(host.loadText("garbage").ok).toBe(false);
    expect(host.session.stateHash()).toBe(hash);
  });

  it("saveText fails with a toast when there is no game", () => {
    const host = new EngineHost();
    expect(host.saveText()).toBeNull();
    expect(host.toasts.getSnapshot().toasts).toHaveLength(1);
  });

  // @covers 024:FR-024
  it("autosaves every configured number of ticks into the storage and loads it back", () => {
    const storage = memoryStorage();
    const { host, fake } = startedHost(storage);
    host.setPrefs({ autosaveEveryTicks: 5 });
    fake.fireMany(5);
    expect(storage.data.has(autosaveStorageKey)).toBe(true);
    expect(host.hasAutosave()).toBe(true);
    const saved = host.session.tick;
    fake.fireMany(3);
    expect(host.loadAutosave()?.ok).toBe(true);
    expect(host.session.tick).toBe(saved);
  });

  it("does not autosave when switched off, and survives a throwing storage", () => {
    const storage = memoryStorage();
    const { host, fake } = startedHost(storage);
    host.setPrefs({ autosaveEveryTicks: 0 });
    fake.fireMany(10);
    expect(storage.data.has(autosaveStorageKey)).toBe(false);
    expect(host.loadAutosave()).toBeNull();
    const broken: PrefsStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const second = startedHost(broken);
    second.host.setPrefs({ autosaveEveryTicks: 2 });
    expect(() => second.fake.fireMany(4)).not.toThrow();
    expect(second.host.hasAutosave()).toBe(false);
    expect(second.host.loadAutosave()).toBeNull();
  });

  it("persists preferences through the storage", () => {
    const storage = memoryStorage();
    const first = new EngineHost({ storage });
    first.setPrefs({ showZones: false });
    expect(new EngineHost({ storage }).getPrefs().showZones).toBe(false);
    expect(new EngineHost().getPrefs()).toEqual(defaultRendererPrefs);
  });

  it("drives a ready-made session", () => {
    const session = new GameSession();
    session.newGame({ seed: 1 });
    const fake = createFakeScheduler();
    const host = new EngineHost({ session, scheduler: fake.scheduler });
    host.startClock();
    fake.fireMany(2);
    expect(session.tick).toBe(2);
    host.dispose();
  });

  it("places builds with the same commands as the CLI build verb", () => {
    const { host } = startedHost();
    const wall = host.commands.placeBuild("wall", 1, [10, 11]);
    const door = host.commands.placeBuild("door", 1, [12]);
    const chest = host.commands.placeBuild("chest", 1, [13]);
    expect([wall.ok, door.ok, chest.ok]).toEqual([true, true, true]);
    const kinds = host.session.query.pendingCommands().commands.map((entry) => entry.kind);
    expect(kinds).toEqual(["PlaceWall", "PlaceDoor", "PlaceFurniture"]);
  });
});
