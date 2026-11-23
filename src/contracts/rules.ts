export type RuleBlock =
  | { kind: 'prose'; markup: string }
  | { kind: 'heading'; text: string }
  | { kind: 'clarification'; code: string | null; anchor: string | null; title: string; markup: string | null }

export type RuleFact = { label: string; markup: string }

export type RuleEntry = {
  id: string
  code: string | null
  anchor: string
  title: string
  blocks: RuleBlock[]
  facts: RuleFact[]
  cost: number | null
  lore: string | null
}

export type RuleSection = { id: string; slug: string; title: string; entries: RuleEntry[] }
/** The pinned upstream file a document's text is read from, and the SHA-256 it must match. */
export type RuleTextSource = { url: string; sha256: string }
export type RuleDocument = {
  id: string
  slug: string
  title: string
  updated: string | null
  text: RuleTextSource | null
  sections: RuleSection[]
}
type RuleEntrySummary = { anchor: string; code: string | null; title: string }
type RuleSectionSummary = { id: string; slug: string; title: string; entries: RuleEntrySummary[] }
export type RuleDocumentSummary = { id: string; slug: string; title: string; updated: string | null; sections: RuleSectionSummary[] }
export type RuleReference = { code: string; document: string; section: string; anchor: string; title: string }
export type RuleIndex = { documents: RuleDocumentSummary[]; references: RuleReference[] }

/** Where a summary's link lands: a rule on a rules page. */
export type RuleSummaryLink = { document: string; section: string; anchor: string }
/** A bold or linked range of a summary, in UTF-16 offsets with an exclusive end. */
export type RuleSummarySpan = { start: number; end: number; bold?: true; link?: RuleSummaryLink }
/** One VS Data summary: original wording, shown for reading only. */
export type RuleSummary = {
  summary: string
  spans: RuleSummarySpan[]
  /** Points the official text leaves open, which the summary reads one way. */
  questions: string[]
}
/**
 * The summaries for the rules one source file prints: `texts` names the records printing each string, by
 * its hash, since several rules can share a line, and `entries` the record of each rules-document entry by its id.
 */
export type RuleSummaries = {
  records: Record<string, RuleSummary>
  texts: Record<string, string[]>
  entries: Record<string, string>
}
