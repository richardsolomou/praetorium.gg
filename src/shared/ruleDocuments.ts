import { groupBy } from '../core/collections'
import { routeSlug } from '../core/slug'
import type { RuleDocument, RuleEntry, RuleSection } from '../contracts/rules'
import type { VsDataCoreRule, VsDataStratagem } from './vsData'

/** Read first, because it is the document the other four amend. */
const CORE_RULES_SLUG = 'core-rules'

export const coreRulesFirst = <T extends { slug: string }>(documents: readonly T[]) =>
  documents.toSorted((left, right) => Number(right.slug === CORE_RULES_SLUG) - Number(left.slug === CORE_RULES_SLUG))

/**
 * The rules documents a VS Data release outlines, core rules first: each document's sections in reading order, each
 * rule with its clarifications beneath it, and a core Stratagem's CP from its release's record. `formerAnchors` names
 * the addresses a rule had before, which older links still use.
 */
export function vsDataRuleDocuments(
  rules: readonly VsDataCoreRule[],
  stratagems: readonly Pick<VsDataStratagem, 'id' | 'cp'>[],
  formerAnchors: (rule: string) => readonly string[] = () => [],
): RuleDocument[] {
  const cost = new Map(stratagems.map((stratagem) => [stratagem.id, stratagem.cp]))
  const ordered = rules.toSorted((left, right) => left.order - right.order)
  const clarifications = groupBy(
    ordered.filter((rule) => rule.parent),
    (rule) => rule.parent!,
  )
  const documents = groupBy(
    ordered.filter((rule) => !rule.parent),
    (rule) => rule.document,
  )
  return coreRulesFirst(
    [...documents].map(([title, entries]) => {
      const slug = routeSlug(title)
      const sections = groupBy(entries, (rule) => rule.section ?? title)
      return {
        id: slug,
        slug,
        title,
        sections: withSlugs(
          [...sections].map(([section, inSection]) => ({
            title: section,
            entries: inSection.map((rule): RuleEntry => ({
              id: rule.id,
              code: rule.number,
              anchor: rule.anchor,
              formerAnchors: formerAnchors(rule.id).filter((anchor) => anchor !== rule.anchor),
              title: rule.name,
              clarifications: (clarifications.get(rule.id) ?? []).map((clarification) => ({
                id: clarification.id,
                code: clarification.number,
                anchor: clarification.anchor,
                title: clarification.name,
              })),
              cost: rule.stratagem ? (cost.get(rule.stratagem) ?? null) : null,
            })),
          })),
        ),
      }
    }),
  )
}

/**
 * A section is addressed by its name without the number it is printed under, and by
 * the numbered name where two sections would otherwise answer to one address.
 */
function withSlugs(sections: Omit<RuleSection, 'id' | 'slug'>[]): RuleSection[] {
  const taken = new Set<string>()
  return sections.map((section) => {
    const preferred = routeSlug(section.title.replace(/^\d+[.)]\s*/, ''))
    const slug = preferred && !taken.has(preferred) ? preferred : routeSlug(section.title)
    taken.add(slug)
    return { ...section, id: slug, slug }
  })
}
