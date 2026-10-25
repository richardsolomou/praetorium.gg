import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { RuleDocument, RuleEntry, RuleIndex, RuleReference } from '../contracts/rules'
import { catalogueSources } from './catalogueSources'
import { coreRulesFirst, ruleDocumentFrom, ruleOutline } from '../shared/ruleDocuments'
import { readSharedJson } from './sharedJson'
import { remember } from '../core/collections'

export type {
  RuleBlock,
  RuleDocument,
  RuleDocumentSummary,
  RuleEntry,
  RuleEntrySummary,
  RuleFact,
  RuleIndex,
  RuleReference,
  RuleSection,
  RuleSectionSummary,
  RuleTextSource,
} from '../contracts/rules'

export { coreRulesFirst }

type TextOrigin = { repository: string; revision: string; path?: string | undefined }

/**
 * Every declared rules document in outline, each pointing at the pinned upstream file
 * its text is read from: Praetorium publishes rule numbers and titles, not rules text.
 */
export function loadRuleDocuments(datacardsDirectory: string, origin: TextOrigin = catalogueSources.datacards): RuleDocument[] {
  const directory = path.join(datacardsDirectory, 'core')
  if (!fs.existsSync(directory)) return []
  const documents = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .toSorted()
    .flatMap((name) => {
      const file = path.join(directory, name)
      const text = {
        url: `https://raw.githubusercontent.com/${origin.repository}/${origin.revision}/${[origin.path, 'core', name].filter(Boolean).join('/')}`,
        sha256: hash('sha256', fs.readFileSync(file)),
      }
      const document = ruleDocumentFrom(readSharedJson(file), text)
      return document ? [ruleOutline(document)] : []
    })
  return coreRulesFirst(documents)
}

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
      updated: document.updated,
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
const numbersIn = (entry: RuleEntry) => [
  ...(entry.code ? [{ code: entry.code, anchor: entry.anchor, title: entry.title }] : []),
  ...entry.blocks.flatMap((block) =>
    block.kind === 'clarification' && block.code && block.anchor ? [{ code: block.code, anchor: block.anchor, title: block.title }] : [],
  ),
]

export function ruleSectionOf(documents: readonly RuleDocument[], documentSlug: string, sectionSlug: string) {
  const document = documents.find((candidate) => candidate.slug === documentSlug)
  const section = document?.sections.find((candidate) => candidate.slug === sectionSlug)
  return document && section ? { document: { slug: document.slug, title: document.title, text: document.text }, section } : null
}
