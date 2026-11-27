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
/** The parts a Stratagem's card gives it, in the order it gives them, by the label each part opens with. */
export const STRATAGEM_PARTS = { when: 'When', target: 'Target', effect: 'Effect', restrictions: 'Restrictions' } as const
export type RuleSummaryParts = {
  when: RuleSummaryBlock[]
  target: RuleSummaryBlock[]
  effect: RuleSummaryBlock[]
  restrictions?: RuleSummaryBlock[]
}
/** One VS Data summary: original wording, shown for reading only, in blocks or, for a Stratagem's, in its parts. */
export type RuleSummary = ({ blocks: RuleSummaryBlock[]; parts?: undefined } | { parts: RuleSummaryParts; blocks?: undefined }) & {
  /** Points the official text leaves open, which the summary reads one way. */
  questions: string[]
}

/**
 * A summary's blocks; a Stratagem's are its parts as VS Data joins them, each opening with its bold label. A summary saved
 * before parts stood alone holds both, and its parts are its blocks.
 */
export function ruleSummaryBlocks(summary: RuleSummary): RuleSummaryBlock[] {
  const { parts } = summary
  if (!parts) return summary.blocks
  return Object.entries(STRATAGEM_PARTS).flatMap(([part, label]) => {
    const [first, ...rest] = parts[part as keyof RuleSummaryParts] ?? []
    if (!first) return []
    const labelled = [{ text: `${label}:`, bold: true as const }, { text: ' ' }]
    return 'paragraph' in first
      ? [{ paragraph: [...labelled, ...first.paragraph] }, ...rest]
      : [{ paragraph: labelled.slice(0, 1) }, first, ...rest]
  })
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
