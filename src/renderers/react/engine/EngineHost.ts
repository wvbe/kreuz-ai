import { CommandKind } from "../../../game/api/Command";
import type { CommandResult } from "../../../game/api/CommandResult";
import { createSessionRunner } from "../../../game/api/createSessionRunner";
import type { SessionRunner } from "../../../game/api/createSessionRunner";
import { GameSession } from "../../../game/api/GameSession";
import type { Scheduler } from "../../../game/engine/AutoRunner";
import { NavigationStore } from "../navigation/NavigationStore";
import { Screen } from "../navigation/Screen";
import { loadRendererPrefs, saveRendererPrefs } from "../prefs/rendererPrefs";
import type { PrefsStorage, RendererPrefs } from "../prefs/rendererPrefs";
import { SelectionStore } from "../selection/SelectionStore";
import { ToolStore } from "../selection/ToolStore";
import { createGameCommands } from "./gameCommands";
import type { GameCommand, GameCommands, NewGameOptions } from "./gameCommands";
import { GameStore } from "./GameStore";
import { ToastKind, ToastStore } from "./ToastStore";

/**
 * Storage key of the autosave slot.
 */
export const autosaveStorageKey = "kreuzvibe.autosave";

/**
 * Construction options of {@link EngineHost}.
 */
export type EngineHostOptions = {
  /**
   * The session to drive; default a fresh `GameSession` over the bundled content.
   */
  session?: GameSession;
  /**
   * Timer facility of the clock; default the engine's real one. Tests pass a fake, so no real
   * time ever passes in a test.
   */
  scheduler?: Scheduler;
  /**
   * Where preferences and the autosave live; null for none. Default none (the browser entry
   * passes `localStorage`).
   */
  storage?: PrefsStorage | null;
};

/**
 * The owner of the engine in the browser (spec 024, DECISIONS D-100): it creates or receives the
 * `GameSession`, owns the clock through the engine's `AutoRunner` (the only timer of the whole
 * renderer, behind the injectable `Scheduler`), and exposes the stores the React tree reads:
 * `store` (versioned queries and events), `selection`, `tools`, `navigation` and `toasts`.
 *
 * Every command of the UI goes through {@link EngineHost.dispatch} (or {@link EngineHost.commands})
 * into `session.dispatch`, the path the CLI uses, so the UI cannot do anything the CLI cannot.
 * The host never reads the wall clock and never changes game state except through commands.
 */
export class EngineHost {
  /**
   * The session; panels read it only through `store` and the hooks.
   */
  readonly session: GameSession;
  /**
   * Versioned queries and events.
   */
  readonly store: GameStore;
  /**
   * Notifications.
   */
  readonly toasts = new ToastStore();
  /**
   * What is selected and hovered, and the active map.
   */
  readonly selection = new SelectionStore();
  /**
   * The map tool (inspect, place).
   */
  readonly tools = new ToolStore();
  /**
   * The screen shown.
   */
  readonly navigation = new NavigationStore();
  /**
   * The typed command wrappers.
   */
  readonly commands: GameCommands;

  private readonly runner: SessionRunner;
  private readonly storage: PrefsStorage | null;
  private prefs: RendererPrefs;
  private lastSignature = "";

  /**
   * Creates the host; the clock stays stopped until a game exists and `startClock` runs.
   *
   * @param options - Session, scheduler and storage.
   */
  constructor(options: EngineHostOptions = {}) {
    this.session = options.session ?? new GameSession();
    this.storage = options.storage ?? null;
    this.prefs = loadRendererPrefs(this.storage);
    this.store = new GameStore(this.session);
    this.commands = createGameCommands({
      dispatch: (command) => this.dispatch(command),
      step: (ticks) => this.step(ticks),
    });
    this.runner = createSessionRunner(this.session, {
      scheduler: options.scheduler,
      onTick: (ok) => {
        this.afterTick(ok);
      },
    });
    this.session.events.subscribe("**", (record) => {
      this.store.pushEvent(record);
      if (record.name === "command.rejected") {
        const payload = record.payload;
        const detail =
          typeof payload === "object" && payload !== null && !Array.isArray(payload)
            ? `${String(payload["commandKind"])} (${String(payload["code"])})`
            : "a command";
        this.toasts.push(ToastKind.Warning, `Command rejected: ${detail}`, record.tick + 288);
      }
    });
  }

  /**
   * The preferences in force.
   *
   * @returns The renderer preferences.
   */
  getPrefs(): RendererPrefs {
    return this.prefs;
  }

  /**
   * Changes preferences and keeps them in the storage.
   *
   * @param patch - The fields to change.
   */
  setPrefs(patch: Partial<RendererPrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    saveRendererPrefs(this.storage, this.prefs);
    this.store.invalidate();
  }

  /**
   * Sends one command through the session. Failures raise an error toast and are returned too;
   * the views refresh either way.
   *
   * @param command - `{ kind, ...payload }`.
   * @returns The session's result.
   */
  dispatch(command: GameCommand): CommandResult {
    const result = this.session.dispatch(command);
    if (!result.ok) {
      this.toasts.push(ToastKind.Error, `${command.kind}: ${result.error.message}`);
    } else if (command.kind === CommandKind.NewGame || command.kind === CommandKind.LoadGame) {
      this.onGameReplaced();
    }
    this.store.invalidate();
    return result;
  }

  /**
   * Runs ticks at once (the `step` command), for tests and debug controls; the clock normally
   * does this.
   *
   * @param ticks - Number of ticks.
   * @returns The session's result.
   */
  step(ticks: number): CommandResult {
    const result = this.session.step(ticks);
    if (!result.ok) {
      this.toasts.push(ToastKind.Error, `step: ${result.error.message}`);
    }
    this.toasts.expire(this.session.tick);
    this.store.invalidate();
    return result;
  }

  /**
   * Starts the real-time clock (no effect without a game or when already running). A paused game
   * keeps the clock polling; pause and speed are ordinary commands.
   */
  startClock(): void {
    if (this.session.hasGame) {
      this.runner.start();
    }
  }

  /**
   * Stops the real-time clock.
   */
  stopClock(): void {
    this.runner.stop();
  }

  /**
   * Whether the clock is scheduling ticks.
   *
   * @returns True while running.
   */
  isClockRunning(): boolean {
    return this.runner.isRunning();
  }

  /**
   * Starts a new game and shows the map.
   *
   * @param options - What the new-game screen collected.
   * @returns The session's result.
   */
  newGame(options: NewGameOptions): CommandResult {
    return this.commands.newGame(options);
  }

  /**
   * Serializes the game for a download.
   *
   * @returns The save text, or null when there is no game (an error toast says why).
   */
  saveText(): string | null {
    const result = this.session.save();
    if (!result.ok || typeof result.data !== "string") {
      this.toasts.push(
        ToastKind.Error,
        result.ok ? "save: unexpected result" : `save: ${result.error.message}`,
      );
      return null;
    }
    return result.data;
  }

  /**
   * Loads a save text; on failure the current game stays.
   *
   * @param text - The contents of a save file.
   * @returns The session's result.
   */
  loadText(text: string): CommandResult {
    return this.dispatch({ kind: CommandKind.LoadGame, save: text });
  }

  /**
   * Loads the autosave slot.
   *
   * @returns The result, or null when the slot is empty or the storage unavailable.
   */
  loadAutosave(): CommandResult | null {
    let text: string | null = null;
    try {
      text = this.storage?.getItem(autosaveStorageKey) ?? null;
    } catch {
      text = null;
    }
    return text === null ? null : this.loadText(text);
  }

  /**
   * Whether an autosave is stored.
   *
   * @returns True when the slot holds a save.
   */
  hasAutosave(): boolean {
    try {
      return (this.storage?.getItem(autosaveStorageKey) ?? null) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Stops the clock; call when the host is thrown away.
   */
  dispose(): void {
    this.runner.stop();
  }

  private onGameReplaced(): void {
    this.store.startEpoch();
    this.selection.reset();
    this.tools.cancel();
    this.lastSignature = "";
    this.navigation.navigate(Screen.Map);
    this.startClock();
  }

  private afterTick(ok: boolean): void {
    if (!ok) {
      this.runner.stop();
      this.toasts.push(ToastKind.Error, "The clock stopped: the game could not advance.");
      this.store.invalidate();
      return;
    }
    const tick = this.session.tick;
    const pending = this.session.query.pendingCommands().commands.length;
    const signature = `${tick}:${pending}`;
    if (signature === this.lastSignature) {
      return;
    }
    this.lastSignature = signature;
    this.toasts.expire(tick);
    this.autosave(tick);
    this.store.invalidate();
  }

  private autosave(tick: number): void {
    const every = this.prefs.autosaveEveryTicks;
    if (this.storage === null || every === 0 || tick === 0 || tick % every !== 0) {
      return;
    }
    const saved = this.session.save();
    if (saved.ok && typeof saved.data === "string") {
      try {
        this.storage.setItem(autosaveStorageKey, saved.data);
      } catch {
        // A full or blocked storage only loses the autosave.
      }
    }
  }
}
