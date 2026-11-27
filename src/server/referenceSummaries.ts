import {
  MISSION_SUMMARIES,
  RULE_SUMMARIES,
  ruleSummaryBlocks,
  type RuleSection,
  type RuleSummaries,
  type RuleSummary,
  type RuleSummaryBlock,
  type RuleSummaryInline,
} from '../contracts/rules'
import type { CanonicalDatasheet, CanonicalDetachment } from '../contracts/catalogue'
import type { ServedRuleSummary } from '../contracts/reference'
import { catalogueEditionId } from '../core/catalogueEdition'
import { remember } from '../core/collections'
import { canonicalDetachmentName } from '../core/detachmentName'
import { hasTextTokens } from '../core/sourceText'
import { routeSlug } from '../core/slug'
import { abilityKeysNamed, recordsPrinting, wholeRuleTokens } from '../shared/ruleSummaries'
import { datasheetAbilitySummary } from '../shared/vsDataAbilities'
import { NO_RULE_SUMMARIES, type VsDataSummaries } from './vsDataSummaries'

/** Whose rules a text prints, as the app's pages name the datasheet or detachment around it. */
export type SummaryOwner = { catalogueId: string; subject: string }

type MissionKind = 'mission-card' | 'mission-award' | 'mission-action' | 'mission-twist'
type Award = { id?: string; criteria?: string | null }
type MissionCard = { key: string; awards?: readonly Award[]; actions?: readonly { id: string }[] }

export const datasheetOwner = (sheet: Pick<CanonicalDatasheet, 'catalogueId' | 'id'>): SummaryOwner => ({
  catalogueId: sheet.catalogueId,
  subject: sheet.id,
})

/** As `detachmentRulesOwner` names a detachment page's owner: VS Data names its rules `<faction>.<detachment>.<name>`. */
export const detachmentOwner = (detachment: Pick<CanonicalDetachment, 'catalogueId' | 'factionSlug' | 'slug'>): SummaryOwner => ({
  catalogueId: detachment.catalogueId,
  subject: `@${detachment.factionSlug}.${routeSlug(canonicalDetachmentName(detachment.slug))}`,
})

/**
 * The VS Data summaries the app's pages show, found the way those pages find them: by the token a rule's text prints,
 * by its owner's record of its name, or by VS Data id for missions, the rules documents and Stratagems only the app
 * prints. Each lookup mirrors one component, named beside it, so an agent reads what a player sees.
 */
export function ruleSummaryFinder(
  summaries: VsDataSummaries | null,
  /**
   * The current file of each string by hash, and the files the snapshot holds: a token a battle or reminder saved before
   * a data update names a file the update replaced, so its string is looked up where it lives now, as `tokensAtHome` does.
   */
  homes?: { homeOf: (hash: string) => string | null; files: Readonly<Record<string, unknown>> },
) {
  let abilities: Record<string, RuleSummary> | undefined
  let coreRules: Record<string, RuleSummary> | undefined
  const unitsOf = (owner: SummaryOwner | undefined) =>
    summaries && owner ? summaries.unitsIn(catalogueEditionId(owner.catalogueId)) : null
  // A corpus reads every faction's file in turn, more than the summaries keep recently used.
  const files = new Map<string, RuleSummaries>()
  const summariesIn = (file: string) => (summaries ? remember(files, file, () => summaries.summariesIn(file)) : NO_RULE_SUMMARIES)

  /** `useRuleSummaries`' records of a printed text. */
  const printed = (text: string) => {
    const tokens = (summaries ? wholeRuleTokens(text) : []).map((token) => {
      const home = homes && !(token.file in homes.files) ? homes.homeOf(token.hash) : null
      return home ? { ...token, file: home } : token
    })
    if (!summaries || !tokens.length) return []
    return recordsPrinting(tokens, new Map(tokens.map((token) => [token.file, summariesIn(token.file)])))
  }
  /** `useKeywordSummary`: the weapon or core ability of a name. */
  const keyword = (name: string) => {
    abilities ??= summaries?.abilities() ?? {}
    return (
      abilityKeysNamed(name)
        .map((key) => abilities![key])
        .find(Boolean) ?? null
    )
  }
  /** `useAbilitySummary` by name: the weapon or core ability, else the whole core rule of that name. */
  const named = (name: string) => {
    coreRules ??= summaries?.coreRules() ?? {}
    return (
      keyword(name) ??
      abilityKeysNamed(name)
        .map((key) => coreRules![key])
        .find(Boolean) ??
      null
    )
  }
  /** `useDatasheetAbilitySummary`. */
  const owned = (text: string, id: string | undefined, owner: SummaryOwner | undefined) =>
    datasheetAbilitySummary(unitsOf(owner), owner?.subject ?? '', id, text ? printed(text) : [])

  return {
    printed: (text: string) => printed(text)[0]?.summary ?? null,
    /** `RuleText`: a rule printed by token, or one a name alone stands for. */
    rule(text: string | null | undefined, { name, id, owner }: { name?: string; id?: string; owner?: SummaryOwner } = {}) {
      if (text ? !hasTextTokens(text) : !name) return null
      return owned(text ?? '', id, owner) ?? (name ? named(name) : null)
    },
    /** `KeywordRuleSummary`. */
    keywordRule(rule: { name: string; description: string | null }, owner?: SummaryOwner) {
      return keyword(rule.name) ?? owned(rule.description ?? '', undefined, owner) ?? named(rule.name)
    },
    /** `useVsDataSummaries`: a rule by its VS Data id in the rules version of `catalogueId`, then in the current one. */
    byId: (catalogueId: string, id: string) => {
      const edition = catalogueEditionId(catalogueId)
      const own = summaries?.unitsIn(edition).abilities[id]
      return own ?? (edition === null ? null : (summaries?.unitsIn(null).abilities[id] ?? null))
    },
    /** `useMissionSummary`. */
    mission: (kind: MissionKind, id: string) => summariesIn(MISSION_SUMMARIES).records[`${kind}:${id}`] ?? null,
    /** `useRuleEntrySummaries`: a rule or clarification of the rules documents, by VS Data id. */
    coreRule: (id: string) => summariesIn(RULE_SUMMARIES).records[`core-rule:${id}`] ?? null,
  }
}

export type RuleSummaryFinder = ReturnType<typeof ruleSummaryFinder>

/**
 * The summary of a rule a tool's answer prints by token in its `description`, as the battle and export screens find
 * it, served for `withTextPointers`; any other record is no rule this can tell.
 */
export const printedRuleSummary = (finder: RuleSummaryFinder) => (record: Record<string, unknown>) => {
  const summary = typeof record.description === 'string' ? finder.printed(record.description) : null
  return summary && servedRuleSummary(summary)
}

/** `AwardCondition`: an award's summary by its VS Data id, or by the token a battle saved. */
export const awardSummary = (finder: RuleSummaryFinder, award: Award) =>
  (award.id ? finder.mission('mission-award', award.id) : null) ?? (award.criteria ? finder.printed(award.criteria) : null)

/**
 * A detachment's rules, enhancements, upgrades and Stratagems, each with the summary its page shows (`CardSummary`,
 * `SummaryById`): a card by its VS Data id, or else by the rule its text prints, and a Stratagem by its id.
 */
export function detachmentSummaries(finder: RuleSummaryFinder, detachment: CanonicalDetachment) {
  const owner = detachmentOwner(detachment)
  const card = (part: { name: string; description: string | null; vsDataId?: string }) =>
    part.vsDataId
      ? finder.byId(detachment.catalogueId, part.vsDataId)
      : part.description
        ? finder.rule(part.description, { name: part.name, owner })
        : null
  return {
    rules: detachment.rules.map(card),
    enhancements: detachment.enhancements.map(card),
    upgrades: detachment.upgrades.map(card),
    stratagems: detachment.stratagems.map((stratagem) => finder.byId(detachment.catalogueId, stratagem.id)),
    keywordRules: detachment.keywordRules.map((keywordRule) => finder.keywordRule(keywordRule, owner)),
  }
}

/** A datasheet's abilities and keyword rules, each with the summary its page shows. */
export function datasheetSummaries(finder: RuleSummaryFinder, sheet: CanonicalDatasheet) {
  const owner = datasheetOwner(sheet)
  return {
    abilities: sheet.abilities.map((ability) =>
      ability.description ? finder.rule(ability.description, { name: ability.name, id: ability.id, owner }) : null,
    ),
    keywordRules: sheet.keywordRules.map((keywordRule) => finder.keywordRule(keywordRule, owner)),
  }
}

/** A mission card's summary, then each award's and action's, as `MissionCardReference` shows them. */
export const missionCardSummaries = (finder: RuleSummaryFinder, card: MissionCard) => ({
  card: finder.mission('mission-card', card.key),
  awards: (card.awards ?? []).map((award) => awardSummary(finder, award)),
  actions: (card.actions ?? []).map((action) => finder.mission('mission-action', action.id)),
})

/** Each entry with the summary beside it, where it has one. */
const withEach = <T extends object>(entries: readonly T[], found: readonly (RuleSummary | null)[]) =>
  entries.map((entry, at) => withSummary(entry, found[at] ?? null))

/**
 * An entry with its summary beside it, or marked as having none where its page shows none, so `withTextPointers` points
 * at its words rather than finding it a summary by its text alone that its page refuses.
 */
export const withSummary = <T extends object>(entry: T, summary: RuleSummary | null): T => ({
  ...entry,
  ruleSummary: summary && servedRuleSummary(summary),
})

/** A detachment as agents read it: each of its rules with Praetorium's own wording of it. */
export function detachmentWithSummaries(finder: RuleSummaryFinder, detachment: CanonicalDetachment): CanonicalDetachment {
  const found = detachmentSummaries(finder, detachment)
  return {
    ...detachment,
    rules: withEach(detachment.rules, found.rules),
    enhancements: withEach(detachment.enhancements, found.enhancements),
    upgrades: withEach(detachment.upgrades, found.upgrades),
    stratagems: withEach(detachment.stratagems, found.stratagems),
    keywordRules: withEach(detachment.keywordRules, found.keywordRules),
  }
}

export function datasheetWithSummaries(finder: RuleSummaryFinder, sheet: CanonicalDatasheet): CanonicalDatasheet {
  const found = datasheetSummaries(finder, sheet)
  return { ...sheet, abilities: withEach(sheet.abilities, found.abilities), keywordRules: withEach(sheet.keywordRules, found.keywordRules) }
}

export function missionCardWithSummaries<T extends MissionCard>(finder: RuleSummaryFinder, card: T): T {
  const found = missionCardSummaries(finder, card)
  return withSummary(
    {
      ...card,
      ...(card.awards ? { awards: withEach(card.awards, found.awards) } : {}),
      ...(card.actions ? { actions: withEach(card.actions, found.actions) } : {}),
    },
    found.card,
  )
}

/** A rules-document section with each rule's and clarification's summary, as its page shows them. */
export const sectionWithSummaries = (finder: RuleSummaryFinder, section: RuleSection): RuleSection => ({
  ...section,
  entries: section.entries.map((entry) =>
    withSummary(
      {
        ...entry,
        clarifications: entry.clarifications.map((clarification) => withSummary(clarification, finder.coreRule(clarification.id))),
      },
      finder.coreRule(entry.id),
    ),
  ),
})

/**
 * A summary as agents get it: its Markdown, then each open question, and a Stratagem's When, Target, Effect and
 * Restrictions apart where its summary is written in those parts.
 */
export function servedRuleSummary(summary: RuleSummary): ServedRuleSummary {
  const questions = summary.questions.map((question) => `The official text leaves this open: ${question}`)
  const parts = Object.entries(summary.parts ?? {}).map(([part, blocks]) => [part, blocks.map(blockMarkdown).join('\n\n')])
  return { text: [...ruleSummaryBlocks(summary).map(blockMarkdown), ...questions].join('\n\n'), ...Object.fromEntries(parts) }
}

const blockMarkdown = (block: RuleSummaryBlock) =>
  'paragraph' in block
    ? runsMarkdown(block.paragraph)
    : block.items.map((item, at) => `${block.list === 'ordered' ? `${at + 1}.` : '-'} ${runsMarkdown(item)}`).join('\n')

const runsMarkdown = (runs: readonly RuleSummaryInline[]) => runs.map(runMarkdown).join('')

/** Bold keeps the spaces around it outside the markers, where Markdown reads them as bold. */
function runMarkdown({ text, bold }: RuleSummaryInline) {
  const [, before = '', words = '', after = ''] = /^(\s*)(.*?)(\s*)$/s.exec(text) ?? []
  return bold && words ? `${before}**${words}**${after}` : text
}
