import { type Definition, profileDescription, targetOf } from '../core/catalogue'
import { groupBy } from '../core/collections'
import { normalizeRuleReference } from '../core/ruleReference'
import { routeSlug } from '../core/slug'
import { textKey, textTokensIn, withoutText } from '../core/sourceText'
import type { TextFacts } from '../core/textFacts'
import { joinKey } from '../core/text'
import { type LoadedCatalogue, datasheetsOf } from '../shared/catalogueIndex'
import { detachmentCatalogueDetail, sameRuleName } from '../shared/catalogueDescriptions'
import { detachmentNamed } from '../shared/factionReferences'
import type { RuleCard } from '../shared/datacards'
import { datacardOf } from '../shared/datasheetJoin'
import { factionContentsOf } from '../shared/factionNames'
import { textFactsOf } from '../shared/textFacts'

/** The card printing a catalogue text's rule, by the catalogue text's `textKey`, and the rule names to list beside it. */
export type CardTwin = { token: string; references: string[] }

/** A qualifier one source prints in an ability's name and the other as a flag or not at all: "(Aura)", "(Once per battle)". */
const abilityKey = (name: string) => joinKey(name.replaceAll(/\s*\([^)]*\)/g, ''))

/** The card's text for a name, matched exactly or, failing that, as `sameRuleName` forgives a misspelling; null where that is ambiguous. */
function cardNamed(cards: readonly RuleCard[], name: string) {
  const key = abilityKey(name)
  const exact = cards.filter((card) => abilityKey(card.name) === key)
  const found = exact.length ? exact : cards.filter((card) => sameRuleName(card.name, name.replaceAll(/\s*\([^)]*\)/g, '')))
  const texts = new Set(found.map((card) => card.description))
  return texts.size === 1 ? found[0]!.description : null
}

/**
 * Every catalogue rules text Game Datacards prints too, with the card's token to show in its place. The card token
 * answers with its catalogue twin's facts wherever it is read, so a catalogue text two cards print differently has
 * no twin; of the catalogue texts sharing a card text, only the most that the rules read alike have one; and none
 * has one whose card text readers already saw alone, or the cards read other grants or reserve exemptions from.
 */
export function cardTwins(loaded: LoadedCatalogue): Map<string, CardTwin> {
  const { candidates, shownAlone } = cardTwinCandidates(loaded)
  const sole = [...candidates].flatMap(([key, { own, cards, printed }]) => {
    const [only, ...others] = cards.values()
    return only && !others.length ? [{ key, own, printed, ...only }] : []
  })
  const facts = (key: string) => loaded.definitions?.fact(key)
  // Combat facts are read only for texts that share a card text: reading them is the slow part.
  const reading = (key: string) => JSON.stringify([ruled(facts(key)), facts(key)?.combat])
  return new Map(
    [...groupBy(sole, (twin) => twin.card).values()].flatMap((group) => {
      // Where catalogue texts sharing a card text read differently, the wording most datasheets print takes it.
      const printed = (twins: typeof group) => twins.reduce((total, twin) => total + twin.printed, 0)
      const [most, next] =
        group.length === 1
          ? [group]
          : [...groupBy(group, (twin) => reading(twin.key)).values()].toSorted((left, right) => printed(right) - printed(left))
      if (next && printed(next) === printed(most!)) return []
      const { card: cardKey, own, token } = most![0]!
      // A card readers already saw alone keeps answering with its own facts there.
      if (shownAlone.has(cardKey)) return []
      const card = loaded.datacards.textFacts?.get(cardKey)
      if (card && JSON.stringify(ruled(card)) !== JSON.stringify(ruled(textFactsOf(loaded.definitions?.words(own) ?? '') ?? {}))) return []
      const references = [...new Set(most!.flatMap((twin) => facts(twin.key)?.references ?? []))]
      return most!.map((twin) => [twin.key, { token, references }] as const)
    }),
  )
}

function soleToken(text: string) {
  const tokens = textTokensIn(text)
  return tokens.length === 1 && withoutText(text) === '' ? tokens[0]! : null
}

/** What the rules read from a text, without the rule names it marks out, which only list rules beside it, or its combat facts. */
const ruled = (facts: TextFacts | undefined) =>
  facts &&
  Object.fromEntries(
    Object.keys(facts).flatMap((key) => (key === 'combat' || key === 'references' ? [] : [[key, facts[key as keyof TextFacts]]])),
  )

/**
 * Each catalogue text, by `textKey`, with how many times it was found and every card text found printing the same
 * rule, by what it reads, and the card texts readers already saw on their own, where the catalogue had none.
 */
export function cardTwinCandidates(loaded: LoadedCatalogue) {
  const candidates = new Map<string, { own: string; printed: number; cards: Map<string, { card: string; token: string }> }>()
  const shownAlone = new Set<string>()
  const pair: Pair = (catalogueText, cardText) => {
    const [own] = catalogueText ? textTokensIn(catalogueText) : []
    const card = cardText ? soleToken(cardText) : null
    if (card && !catalogueText) shownAlone.add(textKey(card))
    // Facts are recorded per token, so a card that assembles a rule from several texts cannot stand in for one.
    if (!own || !card || own.transform !== 'plain') return
    const found = candidates.get(textKey(own)) ?? { own: catalogueText!, printed: 0, cards: new Map() }
    found.printed += 1
    // Two files that print a card alike, but for a line break, print one text.
    const reading = loaded.datacards.textReadings?.get(textKey(card)) ?? textKey(card)
    if (!found.cards.has(reading)) found.cards.set(reading, { card: textKey(card), token: cardText! })
    candidates.set(textKey(own), found)
  }
  datasheetAbilities(loaded, pair)
  enhancements(loaded, pair)
  keywordRules(loaded, pair)
  return { candidates, shownAlone }
}

type Pair = (catalogueText: string | null | undefined, cardText: string | null | undefined) => void

/**
 * Each joined datasheet's abilities against its card's. The walk reaches what a datasheet prints and what its
 * options carry, as `datasheetIn` does, without a library's other entries; core rules are left to the keywords.
 */
function datasheetAbilities(loaded: LoadedCatalogue, pair: Pair) {
  const { index } = loaded
  const core = (ruleId: string) => index.catalogues.get(index.ruleCatalogueOf.get(ruleId) ?? '')?.gameSystem
  for (const book of loaded.factions)
    for (const entryId of datasheetsOf(index, book.id)) {
      const cards = datacardOf(loaded, book.id, entryId)?.details.abilities
      if (!cards) continue
      const ability = (name: string | undefined, text: string | null | undefined) => name && text && pair(text, cardNamed(cards, name))
      const own = (definition: Definition) => {
        for (const profile of [...(definition.profiles ?? []), ...(definition.infoGroups ?? []).flatMap((group) => group.profiles ?? [])])
          if (profile.typeName === 'Abilities') ability(profile.name, profileDescription(profile))
        for (const link of definition.infoLinks ?? []) {
          const shared = index.shared.get(link.targetId)
          if (shared && 'characteristics' in shared && shared.typeName === 'Abilities')
            ability(link.name ?? shared.name, profileDescription(shared))
          const rule = index.rules.get(link.targetId)
          if (rule && !core(link.targetId)) ability(link.name ?? rule.name, rule.description)
        }
      }
      const visited = new Set<string>()
      const visit = (definition: Definition) => {
        if (visited.has(definition.id)) return
        visited.add(definition.id)
        own(definition)
        const target = targetOf(definition, index.definitions)
        // A linked entry is part of the datasheet; a linked group may be a whole library.
        if (target !== definition) {
          if (target.type) visit(target)
          else own(target)
        }
        for (const child of [
          ...(definition.selectionEntries ?? []),
          ...(definition.selectionEntryGroups ?? []),
          ...(definition.entryLinks ?? []),
        ])
          visit(child)
      }
      visit(index.definitions.get(entryId)!)
    }
}

/** Each detachment's enhancements and upgrades as its page joins them: the card's names, the catalogue's entries by them. */
function enhancements(loaded: LoadedCatalogue, pair: Pair) {
  for (const book of loaded.factions) {
    // The nearest file's cards win, as the faction's own file names its detachments first.
    const byDetachment = new Map(
      factionContentsOf(loaded, book.name)
        .toReversed()
        .flatMap((content) => [...content.enhancements.values()].map((cards) => [routeSlug(cards[0]!.detachment), cards] as const)),
    )
    for (const option of loaded.detachments.get(book.id)?.options ?? []) {
      const cards = detachmentNamed(byDetachment, option.name)
      if (!cards?.length) continue
      const detail = detachmentCatalogueDetail(
        loaded,
        book.id,
        option.id,
        cards.map((card) => card.name),
      )
      for (const enhancement of detail?.enhancements ?? [])
        pair(enhancement.description, cards.find((card) => card.name === enhancement.name)?.description)
    }
  }
}

function keywordRules(loaded: LoadedCatalogue, pair: Pair) {
  const cards = new Map((loaded.datacards.keywordRules ?? []).map((rule) => [normalizeRuleReference(rule.name), rule.description]))
  for (const [id, rule] of loaded.index.rules)
    if (rule.name && loaded.index.catalogues.get(loaded.index.ruleCatalogueOf.get(id) ?? '')?.gameSystem)
      pair(rule.description, cards.get(normalizeRuleReference(rule.name)))
}
