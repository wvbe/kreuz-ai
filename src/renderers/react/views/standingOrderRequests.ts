/**
 * What opens the "Keep in stock..." form for a material: the standing-orders panel (task 6.4)
 * registers its opener here with {@link setStandingOrderFormOpener}; views that offer the action
 * (the flow view, later the content browser and inventory rows) call {@link openStandingOrderForm}
 * and need not know whether the panel exists.
 */
export type StandingOrderFormOpener = (materialId: string) => void;

const noOpener: StandingOrderFormOpener = () => undefined;
let opener: StandingOrderFormOpener = noOpener;

/**
 * Registers the function that opens the standing-order form prefilled with a material; call with
 * null to go back to the no-op default (tests).
 *
 * @param next - The opener, or null for the default.
 */
export function setStandingOrderFormOpener(next: StandingOrderFormOpener | null): void {
  opener = next ?? noOpener;
}

let requestedMaterial: string | null = null;

/**
 * Remembers the material of a "Keep in stock..." request until the standing-orders tab reads it.
 *
 * @param materialId - The material the order should keep in stock.
 */
export function rememberStandingOrderMaterial(materialId: string): void {
  requestedMaterial = materialId;
}

/**
 * Hands over the material of the last "Keep in stock..." request, once.
 *
 * @returns The material, or null when nobody asked since the last call.
 */
export function takeStandingOrderMaterial(): string | null {
  const material = requestedMaterial;
  requestedMaterial = null;
  return material;
}

/**
 * Asks for the "Keep in stock..." form of a material. Does nothing while no panel registered an
 * opener.
 *
 * @param materialId - The material the order should keep in stock.
 */
export function openStandingOrderForm(materialId: string): void {
  opener(materialId);
}
