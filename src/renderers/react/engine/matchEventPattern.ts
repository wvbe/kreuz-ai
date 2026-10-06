/**
 * Whether an event name matches a topic pattern as the event bus reads them: segments are
 * separated by dots, `*` stands for exactly one segment and `**` for any number (including none
 * cursor the end), so `inventory.*` matches `inventory.changed` and `**` matches everything.
 *
 * @param pattern - The pattern, for example `command.*`.
 * @param name - The event name, for example `command.rejected`.
 * @returns True when the name matches.
 */
export function matchEventPattern(pattern: string, name: string): boolean {
  const wanted = pattern.split(".");
  const actual = name.split(".");
  const walk = (from: number, cursor: number): boolean => {
    if (from === wanted.length) {
      return cursor === actual.length;
    }
    const part = wanted[from];
    if (part === "**") {
      for (let skip = cursor; skip <= actual.length; skip += 1) {
        if (walk(from + 1, skip)) {
          return true;
        }
      }
      return false;
    }
    if (cursor >= actual.length) {
      return false;
    }
    return (part === "*" || part === actual[cursor]) && walk(from + 1, cursor + 1);
  };
  return walk(0, 0);
}
