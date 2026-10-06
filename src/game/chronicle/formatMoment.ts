import type { ContentRegistries } from "../content/ContentRegistries";
import { toDay } from "../time/GameTime";
import type { MomentRecord } from "./chronicleTypes";

function words(id: string): string {
  return id.replaceAll("-", " ").replaceAll("_", " ");
}

function param(record: MomentRecord, name: string): string {
  return String(record.params[name] ?? "");
}

/**
 * Renders a moment as flavour text (spec 028 FR-016): the content template of its kind with the
 * placeholders `{name}` (the name snapshot of the record), `{noun}`, `{nounLower}`, `{skillName}`,
 * `{guildName}`, `{office}`, `{milestone}`, `{tier}`, `{dwellingLevel}`, `{previousName}`,
 * `{day}` (the 1-based game day of the tick) and `{settlementNoun}` (the noun of the tier the
 * record names, else of the tier in force at the record's tick). The text is never stored; this pure helper is the one
 * place that builds it, so every renderer shows the same words.
 *
 * @param content - The content registries (templates, skills, tiers).
 * @param record - The moment.
 * @param currentTier - The settlement tier in force at the record's tick, for kinds that name none.
 * @returns The text; the empty string when the kind has no template.
 */
export function formatMoment(
  content: ContentRegistries,
  record: MomentRecord,
  currentTier: string,
): string {
  const template = content.momentTemplates.find(record.kind)?.template;
  if (template === undefined) {
    return "";
  }
  const noun = param(record, "noun");
  const tier = record.params["tier"] === undefined ? currentTier : param(record, "tier");
  const values: { [placeholder: string]: string } = {
    name: record.nameSnapshot ?? "",
    noun,
    nounLower: noun.toLowerCase(),
    skillName: content.skills.find(param(record, "skillId"))?.name ?? param(record, "skillId"),
    guildName: param(record, "guildName"),
    office: param(record, "office"),
    milestone: words(param(record, "milestone")),
    tier: words(tier),
    dwellingLevel: words(param(record, "dwellingLevel")),
    previousName: param(record, "previousName"),
    day: String(toDay(record.tick) + 1),
    settlementNoun: content.settlementTiers.find(tier)?.settlementNoun ?? words(tier),
  };
  let text = template;
  for (const [placeholder, value] of Object.entries(values)) {
    text = text.replaceAll(`{${placeholder}}`, value);
  }
  return text;
}
