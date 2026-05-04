import React, { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { createGame, tickGame, dispatchCommand, subscribeToState, type GameInstance } from "@game/engine/GameEngine.js";
import type { GameState } from "@game/engine/GameLoop.js";

type GameContextType = {
  instance: GameInstance;
  state: GameState;
  tick: number;
  paused: boolean;
  speed: number;
  dispatch: (command: { type: string; payload: Record<string, unknown> }) => void;
  togglePause: () => void;
  setSpeed: (speed: number) => void;
};

const GameContext = createContext<GameContextType | null>(null);

/**
 * Provides game engine state to React components.
 */
export function GameProvider({ children, seed }: { children: ReactNode; seed?: number }) {
  const instanceRef = useRef<GameInstance | null>(null);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeedState] = useState(1);

  if (!instanceRef.current) {
    instanceRef.current = createGame({ seed: seed ?? 42, mapCellCount: 600, mapWidth: 200, mapHeight: 200, initialColonists: 12 });
  }

  const instance = instanceRef.current;

  useEffect(() => {
    const unsubscribe = subscribeToState(instance, (state) => {
      setTick(state.tick);
    });
    return unsubscribe;
  }, [instance]);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      tickGame(instance);
    }, Math.max(16, 1000 / (speed * 10)));
    return () => clearInterval(interval);
  }, [instance, paused, speed]);

  const dispatch = useCallback(
    (command: { type: string; payload: Record<string, unknown> }) => {
      dispatchCommand(instance, command);
    },
    [instance],
  );

  const togglePause = useCallback(() => {
    const newPaused = !paused;
    setPaused(newPaused);
    dispatch({ type: newPaused ? "pause" : "resume", payload: {} });
  }, [paused, dispatch]);

  const setSpeed = useCallback(
    (newSpeed: number) => {
      setSpeedState(newSpeed);
      dispatch({ type: "set_speed", payload: { speed: newSpeed } });
    },
    [dispatch],
  );

  const value: GameContextType = {
    instance,
    state: instance.state,
    tick,
    paused,
    speed,
    dispatch,
    togglePause,
    setSpeed,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

/**
 * Hook to access the game context.
 */
export function useGame(): GameContextType {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used within a GameProvider");
  return context;
}
