import type { ContentRegistries } from "../content/ContentRegistries";
import type { Entity } from "../ecs/Entity";
import { skillLevel } from "../skills/skillLevels";
import { TitleRank } from "./identityTypes";
import type { Title } from "./identityTypes";

/**
 * The content constants the title derivation reads (`titleThreshold`, `titleSwitchMargin`).
 */
export type TitleConstants = {
  readonly titleThreshold: number;
  readonly titleSwitchMargin: number;
};

/**
 * The part of the content the title derivation reads.
 */
export type TitleContentView = {
  readonly skills: ContentRegistries["skills"];
  readonly factions: ContentRegistries["factions"];
  readonly constants: TitleConstants;
};

function candidateFor(content: TitleContentView, entity: Entity, skillId: string): Title | null {
  const level = skillLevel(entity, skillId);
  if (level < content.constants.titleThreshold) {
    return null;
  }
  const noun = content.skills.require(skillId).titleNoun;
  const guilds = content.factions
    .all()
    .filter((faction) => faction.membership?.skillId === skillId);
  let master: string | null = null;
  let threshold = Number.POSITIVE_INFINITY;
  for (const guild of guilds) {
    if (guild.masterSkillThreshold < threshold) {
      threshold = guild.masterSkillThreshold;
      master = guild.id;
    }
  }
  return level >= threshold
    ? { skillId, rank: TitleRank.Master, noun, guildId: master }
    : { skillId, rank: TitleRank.Practitioner, noun, guildId: null };
}

function rankValue(rank: TitleRank): number {
  return rank === TitleRank.Master ? 2 : 1;
}

/**
 * Derives the skill title of a citizen (spec 028 FR-007/FR-008, pure, no PRNG). A skill qualifies
 * from `titleThreshold`; it is a Master title from the lowest `masterSkillThreshold` of the guilds
 * whose membership uses that skill. The best candidate is ordered by rank (Master first), then
 * level, then skill id ascending. The current title skill is kept unless a candidate has a higher
 * rank or the same rank with a level at least `titleSwitchMargin` above the current one.
 *
 * @param content - Skill, faction and constant tables.
 * @param entity - The citizen.
 * @param current - The current title (the stored snapshot), or null.
 * @returns The new title, or null when no skill qualifies.
 */
export function deriveTitle(
  content: TitleContentView,
  entity: Entity,
  current: Title | null,
): Title | null {
  const candidates: Title[] = [];
  for (const skillId of [...content.skills.ids()].sort()) {
    const candidate = candidateFor(content, entity, skillId);
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }
  let best: Title | null = null;
  for (const candidate of candidates) {
    if (
      best === null ||
      rankValue(candidate.rank) > rankValue(best.rank) ||
      (candidate.rank === best.rank &&
        skillLevel(entity, candidate.skillId) > skillLevel(entity, best.skillId))
    ) {
      best = candidate;
    }
  }
  if (best === null || current === null) {
    return best;
  }
  const kept = candidates.find((candidate) => candidate.skillId === current.skillId);
  if (kept === undefined || kept.skillId === best.skillId) {
    return best;
  }
  const switches =
    rankValue(best.rank) > rankValue(kept.rank) ||
    (best.rank === kept.rank &&
      skillLevel(entity, best.skillId) >=
        skillLevel(entity, kept.skillId) + content.constants.titleSwitchMargin);
  return switches ? best : kept;
}
