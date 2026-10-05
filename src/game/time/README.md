# src/game/time

The simulation clock (spec 001).

- `GameTime.ts` - integer `tickCount`, pause flag, `SpeedSetting` (serialized as its permille number: 250, 500, 1000, 2000, 4000) and `tickIntervalMs` (default 6250). Calendar helpers (`toDay`, `toWeek`, `toMonth`, `toYear`, `tickOfDay`, `hourOfDay`, `toGameHours`) are pure functions of the tick; days are 0-indexed; 12 ticks per hour, 288 per day, 336 per year.
- `GameTime.restore` validates saved state strictly and throws `GameTimeError`; there are no fallback defaults.
- The clock never reads the wall clock. Real-time scheduling lives only in `engine/AutoRunner.ts`.

Serialized shape (root key `time`): `{ tickCount, paused, speed, tickIntervalMs }`.
