/**
 * The screens of the single-page app (spec 024 FR-022): the shell switches between them without a
 * reload. The value is the label used in the URL hash and in tests.
 */
export enum Screen {
  Map = "map",
  Content = "content",
  Chronicle = "chronicle",
  Flow = "flow",
  IdleBlocked = "idle-blocked",
  StandingOrders = "standing-orders",
  NewGame = "new-game",
  Settings = "settings",
}
