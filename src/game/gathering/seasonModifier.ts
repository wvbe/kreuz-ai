/**
 * The growth speed of crops, in permille of normal (1000 = normal). v1 has no season system
 * (DECISIONS D-15 and D-52), so this is always 1000; it is the hook where a calendar would slow
 * or stop growth in winter (it would then take the tick or the game time as a parameter).
 *
 * @returns Permille of the normal growth speed.
 */
export function seasonModifier(): number {
  return 1000;
}
