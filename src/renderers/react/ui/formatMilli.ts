/**
 * Formats a thousandths value as a decimal with one digit (`1500` as `1.5`) without floats.
 *
 * @param milli - A whole number of thousandths.
 * @returns The text.
 */
export function formatMilli(milli: number): string {
  const sign = milli < 0 ? "-" : "";
  const tenths = Math.floor(Math.abs(milli) / 100);
  return `${sign}${Math.floor(tenths / 10)}.${tenths % 10}`;
}
