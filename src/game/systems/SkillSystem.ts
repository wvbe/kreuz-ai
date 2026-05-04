/**
 * Skill system: skill levels, experience gain, and level-up logic.
 */

export type Skill = {
  skillId: string;
  level: number;
  experience: number;
  experienceToNext: number;
};

export type SkillsComponent = {
  skills: Map<string, Skill>;
};

/**
 * Creates a skills component with initial skills.
 */
export function createSkillsComponent(skillIds: string[]): SkillsComponent {
  const skills = new Map<string, Skill>();
  for (const skillId of skillIds) {
    skills.set(skillId, {
      skillId,
      level: 1,
      experience: 0,
      experienceToNext: 100,
    });
  }
  return { skills };
}

/**
 * Adds experience to a skill and handles level-ups.
 */
export function addExperience(skills: SkillsComponent, skillId: string, amount: number): boolean {
  const skill = skills.skills.get(skillId);
  if (!skill) return false;

  skill.experience += amount;
  let leveledUp = false;
  while (skill.experience >= skill.experienceToNext) {
    skill.experience -= skill.experienceToNext;
    skill.level++;
    skill.experienceToNext = Math.floor(skill.experienceToNext * 1.5);
    leveledUp = true;
  }
  return leveledUp;
}

/**
 * Gets the level of a specific skill.
 */
export function getSkillLevel(skills: SkillsComponent, skillId: string): number {
  return skills.skills.get(skillId)?.level ?? 0;
}

/**
 * Gets the speed modifier for a skill (higher skill = faster work).
 */
export function getSkillModifier(skills: SkillsComponent, skillId: string): number {
  const level = getSkillLevel(skills, skillId);
  return 0.5 + level * 0.1;
}
