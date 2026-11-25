/** A clarification a rules document numbers beneath a rule, as 01.02.06 beneath Units and Models. */
export type RuleClarification = { id: string; code: string | null; anchor: string; title: string }

export type RuleEntry = {
  /** The rule's VS Data `core-rule` id. */
  id: string
  code: string | null
  anchor: string
  /** Addresses the rule answered to before VS Data outlined the documents, which older links still name. */
  formerAnchors: string[]
  title: string
  clarifications: RuleClarification[]
  /** The CP of the core Stratagem the rule prints. */
  cost: number | null
}

export type RuleSection = { id: string; slug: string; title: string; entries: RuleEntry[] }
export type RuleDocument = { id: string; slug: string; title: string; sections: RuleSection[] }
type RuleEntrySummary = { anchor: string; code: string | null; title: string }
type RuleSectionSummary = { id: string; slug: string; title: string; entries: RuleEntrySummary[] }
export type RuleDocumentSummary = { id: string; slug: string; title: string; sections: RuleSectionSummary[] }
export type RuleReference = { code: string; document: string; section: string; anchor: string; title: string }
export type RuleIndex = { documents: RuleDocumentSummary[]; references: RuleReference[] }
/** The shape a rules section is read in, in its query key, so a section a device saved in an earlier shape is never read as this one. */
export const RULE_OUTLINE = 'vs-data'

/** Where a summary's link lands: a rule on a rules page. */
export type RuleSummaryLink = { document: string; section: string; anchor: string }
/**
 * A run of a summary's text: bold, linking to a rule, or naming the weapon or core ability whose summary its tooltip
 * shows, as `kind:id` in the ability summaries.
 */
export type RuleSummaryInline = { text: string; bold?: true; link?: RuleSummaryLink; ability?: string }
/** A paragraph or a list of a summary, each item a line of runs. */
export type RuleSummaryBlock = { paragraph: RuleSummaryInline[] } | { list: 'ordered' | 'unordered'; items: RuleSummaryInline[][] }
/** One VS Data summary: original wording, shown for reading only. */
export type RuleSummary = {
  blocks: RuleSummaryBlock[]
  /** Points the official text leaves open, which the summary reads one way. */
  questions: string[]
}
/**
 * The summaries for the rules one source file prints: `texts` names the records printing each string, by
 * its hash, since several rules can share a line, and `entries` the record of each rules-document entry by its id.
 */
/**
 * The summaries of the current mission pack's cards, awards, actions and twists, asked for in place of a source file:
 * mission data carries VS Data IDs, never tokens, so its records are keyed `kind:id`.
 */
export const MISSION_SUMMARIES = 'missions'
/** The summaries of the current rules version's rules documents, asked for in place of a source file, keyed `core-rule:id`. */
export const RULE_SUMMARIES = 'rules'
export type RuleSummaries = {
  records: Record<string, RuleSummary>
  texts: Record<string, string[]>
  entries: Record<string, string>
  /** No file of the active snapshot has this id: a data update replaced it, so its strings live in another file now. */
  replaced?: true
}
