import type { ReactElement } from "react";
import { Screen } from "../navigation/Screen";
import { MapScreen } from "./MapScreen";
import { NewGameScreen } from "./NewGameScreen";
import { PlaceholderScreen } from "./PlaceholderScreen";
import { SettingsScreen } from "./SettingsScreen";

/**
 * One entry of the shell: the screen id, its menu label and what it renders.
 */
export type ScreenDefinition = {
  screen: Screen;
  label: string;
  render: () => ReactElement;
};

/**
 * The screens of the shell in menu order. To build a screen of a later task, replace its
 * `PlaceholderScreen` entry with the real component; the shell, the menu and the routing need no
 * change.
 */
export const screenRegistry: readonly ScreenDefinition[] = [
  { screen: Screen.Map, label: "Map", render: () => <MapScreen /> },
  {
    screen: Screen.Content,
    label: "Content",
    render: () => <PlaceholderScreen title="Content browser" task="6.5" />,
  },
  {
    screen: Screen.Chronicle,
    label: "Chronicle",
    render: () => <PlaceholderScreen title="Chronicle" task="6.5" />,
  },
  {
    screen: Screen.Flow,
    label: "Flow",
    render: () => <PlaceholderScreen title="Production flow" task="6.5" />,
  },
  {
    screen: Screen.IdleBlocked,
    label: "Idle and blocked",
    render: () => <PlaceholderScreen title="Idle and blocked" task="6.5" />,
  },
  {
    screen: Screen.StandingOrders,
    label: "Standing orders",
    render: () => <PlaceholderScreen title="Standing orders" task="6.4" />,
  },
  { screen: Screen.NewGame, label: "New game", render: () => <NewGameScreen /> },
  { screen: Screen.Settings, label: "Settings", render: () => <SettingsScreen /> },
];
