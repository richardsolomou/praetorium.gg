export type RuleBlock =
  | { kind: 'prose'; markup: string }
  | { kind: 'heading'; text: string }
  | { kind: 'clarification'; code: string | null; anchor: string | null; title: string; markup: string }

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
export type RuleDocument = { id: string; slug: string; title: string; updated: string | null; sections: RuleSection[] }
export type RuleEntrySummary = { anchor: string; code: string | null; title: string }
export type RuleSectionSummary = { id: string; slug: string; title: string; entries: RuleEntrySummary[] }
export type RuleDocumentSummary = { id: string; slug: string; title: string; updated: string | null; sections: RuleSectionSummary[] }
export type RuleReference = { code: string; document: string; section: string; anchor: string; title: string }
export type RuleIndex = { documents: RuleDocumentSummary[]; references: RuleReference[]; attribution: string }
