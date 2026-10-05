/**
 * The full name of a citizen: given name and byname, without ordinal or title.
 *
 * @param givenName - Given name.
 * @param byname - Byname, or null.
 * @returns "Ansel atte Brook" or "Ansel".
 */
export function fullName(givenName: string, byname: string | null): string {
  return byname === null || byname === "" ? givenName : `${givenName} ${byname}`;
}

/**
 * Whether two full names count as the same name: equal ignoring case.
 *
 * @param left - One full name.
 * @param right - The other full name.
 * @returns True for namesakes.
 */
export function sameName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

const romanDigits: readonly (readonly [number, string])[] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/**
 * Roman numeral of a name ordinal ("Ansel atte Brook II").
 *
 * @param value - Integer `1..3999`.
 * @returns The numeral; the empty string for anything below 1.
 */
export function romanNumeral(value: number): string {
  let rest = Math.min(3999, Math.max(0, Math.trunc(value)));
  let text = "";
  for (const [size, digits] of romanDigits) {
    while (rest >= size) {
      text += digits;
      rest -= size;
    }
  }
  return text;
}

/**
 * The lowest ordinal `>= 2` not yet used by a namesake (spec 028 FR-004).
 *
 * @param used - Ordinals held by living citizens with the same full name (0 = none).
 * @returns The ordinal to assign.
 */
export function lowestFreeOrdinal(used: readonly number[]): number {
  let candidate = 2;
  while (used.includes(candidate)) {
    candidate += 1;
  }
  return candidate;
}
