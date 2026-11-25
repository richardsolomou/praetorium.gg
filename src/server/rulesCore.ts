import type { RuleDocument, RuleEntry, RuleIndex, RuleReference } from '../contracts/rules'
import { remember } from '../core/collections'

/**
 * Every document and section by name, with the rule numbers each page answers to.
 *
 * Small enough to load with any rules page, which is what lets a rule that quotes
 * `(10.05)` link straight to it without the reader's page holding all five
 * documents. Numbers belong to the document that prints them — Combat Patrol has an
 * `01.03` of its own — so they are collected per document and read that way.
 *
 * Built once per snapshot, because every rules page asks for it.
 */
export const ruleIndexOf = (documents: readonly RuleDocument[]): RuleIndex => remember(indexes, documents, () => buildRuleIndex(documents))

const indexes = new WeakMap<readonly RuleDocument[], RuleIndex>()

function buildRuleIndex(documents: readonly RuleDocument[]): RuleIndex {
  const references: RuleReference[] = []
  const summaries = documents.map((document) => {
    const claimed = new Set<string>()
    return {
      id: document.id,
      slug: document.slug,
      title: document.title,
      sections: document.sections.map((section) => ({
        id: section.id,
        slug: section.slug,
        title: section.title,
        entries: section.entries.map((entry) => {
          for (const { code, anchor, title } of numbersIn(entry)) {
            if (claimed.has(code)) continue
            claimed.add(code)
            references.push({ code, title, anchor, document: document.slug, section: section.slug })
          }
          return { anchor: entry.anchor, code: entry.code, title: entry.title }
        }),
      })),
    }
  })
  return { documents: summaries, references }
}

/** The entry's own number, then each clarification numbered beneath it. */
const numbersIn = (entry: RuleEntry) =>
  [entry, ...entry.clarifications].flatMap(({ code, anchor, title }) => (code ? [{ code, anchor, title }] : []))

export function ruleSectionOf(documents: readonly RuleDocument[], documentSlug: string, sectionSlug: string) {
  const document = documents.find((candidate) => candidate.slug === documentSlug)
  const section = document?.sections.find((candidate) => candidate.slug === sectionSlug)
  return document && section ? { document: { slug: document.slug, title: document.title }, section } : null
}
