import rawPages from '../../catalogue/legacy-ids/rule-pages.json' with { type: 'json' }
import rawRules from '../../catalogue/legacy-ids/rules.json' with { type: 'json' }
import { groupBy } from './collections'
import { legacyIds, legacyIdsSchema } from './legacyIds'

const formerIds = groupBy(Object.entries(legacyIdsSchema.parse(rawRules).ids), ([, rule]) => rule)

/**
 * The Game Datacards ids of a rules document's rule, by its VS Data id: a rule that printed no number was addressed by
 * one, so a link made then still names it.
 */
export const formerRuleIds = (rule: string): string[] => (formerIds.get(rule) ?? []).map(([id]) => id)

/** The document slug, or `document/section` slugs, a rules page stored or linked by its Game Datacards id answers to. */
export const currentRulePage = legacyIds(rawPages)
