import type { RuleIndex, RuleReference } from '../server/rulesCore'

/**
 * Where each number a rule can quote leads, answered from the document quoting it.
 *
 * A rule reads `(10.05)` and means the rule its own document numbers 10.05, so the
 * document being read is asked first and the core rules — which every other document
 * amends, and which the index puts first — answer for anything it does not print
 * itself. A number neither of them prints stays the text the rule prints.
 */
export type RuleLinks = ReadonlyMap<string, RuleReference>

export function ruleLinks(index: RuleIndex | null | undefined, documentSlug: string): RuleLinks {
  const links = new Map<string, RuleReference>()
  if (!index) return links
  const core = index.documents[0]?.slug
  for (const reference of index.references) {
    if (reference.document === core) links.set(reference.code, reference)
  }
  for (const reference of index.references) {
    if (reference.document === documentSlug) links.set(reference.code, reference)
  }
  return links
}
