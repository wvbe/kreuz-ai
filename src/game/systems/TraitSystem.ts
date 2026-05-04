/**
 * Trait system: trait application and effect modifiers on entity behavior.
 */

export type TraitEffect = {
  targetStat: string;
  modifier: number;
  isMultiplier: boolean;
};

export type Trait = {
  traitId: string;
  name: string;
  description: string;
  effects: TraitEffect[];
};

export type TraitsComponent = {
  traits: Trait[];
};

/**
 * Creates an empty traits component.
 */
export function createTraitsComponent(): TraitsComponent {
  return { traits: [] };
}

/**
 * Adds a trait to an entity.
 */
export function addTrait(component: TraitsComponent, trait: Trait): void {
  if (!component.traits.some((existing) => existing.traitId === trait.traitId)) {
    component.traits.push(trait);
  }
}

/**
 * Removes a trait from an entity.
 */
export function removeTrait(component: TraitsComponent, traitId: string): void {
  component.traits = component.traits.filter((trait) => trait.traitId !== traitId);
}

/**
 * Calculates the total modifier for a stat from all traits.
 */
export function calculateTraitModifier(component: TraitsComponent, targetStat: string): number {
  let additive = 0;
  let multiplier = 1;
  for (const trait of component.traits) {
    for (const effect of trait.effects) {
      if (effect.targetStat === targetStat) {
        if (effect.isMultiplier) {
          multiplier *= effect.modifier;
        } else {
          additive += effect.modifier;
        }
      }
    }
  }
  return (1 + additive) * multiplier;
}
