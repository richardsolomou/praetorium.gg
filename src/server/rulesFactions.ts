import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import { routeSlug } from '../core/slug'
import { byName, factionDirectories, joinKey, readJson, readOptionalList, titleCase } from './rulesSource'
import { type RawStratagem, toStratagem } from './rulesCards'
import {
  type ConstructionEnhancement,
  constructionCardKey,
  constructionDetachment,
  datacardsFactionKeys,
  descriptionKey,
  type FactionContent,
  type LoadedDatacards,
} from './datacards'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'
import { canonicalIdsFor, externalIdsFor, type ExternalReferences, loadExternalReferences } from './externalReferences'

/**
 * Who the factions are, and what each of their detachments brings.
 *
 * Names, icons and army rules from the licensed dataset; the prose that describes a
 * detachment ability, enhancement or stratagem from Game Datacards. Everything is
 * keyed by the faction directory the dataset uses, which is also the slug the app
 * routes reference pages by.
 */

type RawFaction = {
  id: string
  name: string
  parent_faction_id?: string | null
  aliases?: string[]
  faction_rule_id?: string
  logo_url?: string
}

type RawDetachment = {
  id: string
  name: string
  enhancement_ids?: string[]
  stratagem_ids?: string[]
}

type RawEnhancement = { id: string; name: string; detachment_id?: string; keyword_restrictions?: string[] }
const isUnitUpgrade = (name: string) => /\s*\(upgrade\)\s*$/i.test(name)

/**
 * The stratagems one detachment brings.
 *
 * The dataset says this twice and the two do not agree. A detachment lists the ids of
 * its six; each stratagem also names a detachment. A stratagem several detachments
 * share is written down once, under whichever of them the dataset filed it, and the
 * others reach it only by id — which is how Armoured Speartip came out with four,
 * missing Armour of Contempt and Rapid Embarkation. Both readings are taken, because
 * each holds stratagems the other leaves out, and a detachment that reaches the same
 * card both ways keeps the copy filed under its own name.
 */
function detachmentStratagems(detachment: RawDetachment, stratagems: readonly RawStratagem[]) {
  const named = new Set(detachment.stratagem_ids ?? [])
  const found = new Map<string, RawStratagem>()
  for (const stratagem of stratagems) {
    if (!named.has(stratagem.id) && stratagem.detachment_id !== detachment.id) continue
    const key = stratagem.name.trim().toLocaleLowerCase()
    if (!found.has(key) || stratagem.detachment_id === detachment.id) found.set(key, stratagem)
  }
  return [...found.values()]
}

function constructionSources(datacards: LoadedDatacards, faction: string, parent: string | null) {
  const own = datacards.factions.get(routeSlug(faction))
  const inherited = parent ? datacards.factions.get(routeSlug(parent)) : undefined
  return { own, inherited: inherited === own ? undefined : inherited }
}

function authoritativeDetachments({ own, inherited }: ReturnType<typeof constructionSources>) {
  const found = new Map<string, { name: string; source: FactionContent }>()
  for (const source of [inherited, own]) {
    if (!source) continue
    for (const name of source.detachments) found.set(joinKey(name), { name, source })
  }
  return found
}

function enhancementsNamed(source: FactionContent, detachment: string): readonly ConstructionEnhancement[] {
  return source.enhancements.get(joinKey(detachment)) ?? []
}

type SemanticSource = {
  detachments: readonly RawDetachment[]
  enhancements: readonly RawEnhancement[]
  stratagems: readonly RawStratagem[]
}

function semanticSourceNamed(sources: readonly SemanticSource[], name: string) {
  for (const source of sources) {
    const matches = source.detachments.filter((candidate) => joinKey(candidate.name) === joinKey(name))
    if (matches.length) return matches.length === 1 ? { source, detachment: matches[0]! } : null
  }
  return null
}

function semanticEnhancementNamed(
  sources: readonly SemanticSource[],
  detachment: string,
  enhancement: ConstructionEnhancement,
  references: ExternalReferences,
): { value: RawEnhancement | null; method: 'external-ref' | 'name' | null } {
  const exactIds = new Set((enhancement.ids ?? []).flatMap((id) => canonicalIdsFor(references.enhancements, 'game-datacards', id)))
  if (exactIds.size) {
    for (const source of sources) {
      const matches = source.enhancements.filter((candidate) => exactIds.has(candidate.id))
      if (matches.length) return { value: matches.length === 1 ? matches[0]! : null, method: 'external-ref' }
    }
    return { value: null, method: 'external-ref' }
  }
  for (const source of sources) {
    const detachments = source.detachments.filter((candidate) => joinKey(candidate.name) === joinKey(detachment))
    if (detachments.length > 1) return { value: null, method: null }
    const owner = detachments[0]
    if (!owner) continue
    const matches = source.enhancements.filter(
      (candidate) => candidate.detachment_id === owner.id && constructionCardKey(candidate.name) === constructionCardKey(enhancement.name),
    )
    if (matches.length) return { value: matches.length === 1 ? matches[0]! : null, method: matches.length === 1 ? 'name' : null }
  }
  return { value: null, method: null }
}

export type DetachmentReference = {
  enhancements: number
  upgrades: number
  stratagems: number
  points: number | null
  dispositions: string[]
}

export type DetachmentRulesDetail = {
  id: string
  name: string
  points: number | null
  dispositions: string[]
  rules: { name: string; description: string }[]
  enhancements: { name: string; points: number | null; description: string | null; keywordRestrictions: string[] | null }[]
  upgrades: { name: string; points: number | null; description: string | null }[]
  stratagems: {
    id: string
    name: string
    cp: number
    type: string | null
    phases: string[]
    turn: string | null
    description: string | null
  }[]
}

export type LoadedFactions = {
  /** Player-facing faction names, separate from BSData's technical catalogue labels. */
  factionNames: Map<string, string>
  factionIcons: Map<string, string>
  factionRules: Map<string, { name: string; description: string }>
  /**
   * Every name a faction answers to, against the one its rules are filed under.
   *
   * The catalogues call the Adeptus Astartes book Space Marines, so a lookup by the
   * name a player sees reaches nothing without this — which is how a whole faction
   * came to have detachments with no points and no stratagems. Resolved on the way
   * in rather than by filing each faction under several keys, because the maps
   * below are read one key at a time and also counted whole.
   */
  factionKeys: Map<string, string>
  /** Each child faction against the parent whose shared construction cards it may use. */
  factionParents: Map<string, string>
  /** Display metadata for each detachment, with construction numbers from Game Datacards. */
  detachmentReferences: Map<string, Map<string, DetachmentReference>>
  detachmentDetails: Map<string, Map<string, DetachmentRulesDetail>>
  /** Faction slug then detachment slug, so a chosen detachment maps straight to its six. */
  byDetachment: Map<string, Map<string, Stratagem[]>>
  /** Whatever the dataset says about how settled these numbers are. */
  dataslate: string | null
  constructionJoinIssues: ConstructionJoinIssue[]
  sourceJoinFallbacks: SourceJoinRecord[]
  sourceJoinExacts: SourceJoinRecord[]
}

export type ConstructionJoinIssue = {
  kind: 'detachment' | 'enhancement'
  faction: string
  detachment: string
  enhancement?: string
}

export type SourceJoinRecord = {
  kind: 'detachment' | 'enhancement' | 'stratagem'
  faction: string
  detachment: string
  name?: string
}

export function loadFactions(
  core: string,
  iconDirectory: string,
  datacards: LoadedDatacards,
  sourceReferences: ExternalReferences = loadExternalReferences(core),
): LoadedFactions {
  const byDetachment = new Map<string, Map<string, Stratagem[]>>()
  const detachmentReferences = new Map<string, Map<string, DetachmentReference>>()
  const detachmentDetails = new Map<string, Map<string, DetachmentRulesDetail>>()
  const factionNames = new Map<string, string>()
  const factionIcons = new Map<string, string>()
  const factionRules = new Map<string, { name: string; description: string }>()
  const factionKeys = new Map<string, string>()
  const factionParents = new Map<string, string>()
  const constructionJoinIssues: ConstructionJoinIssue[] = []
  const sourceJoinFallbacks: SourceJoinRecord[] = []
  const sourceJoinExacts: SourceJoinRecord[] = []
  let dataslate: string | null = null

  const factions = factionDirectories(core)
  for (const faction of factions) factionKeys.set(faction, faction)
  for (const faction of factions) {
    const factionFile = path.join(core, faction, 'factions.json')
    if (fs.existsSync(factionFile)) {
      for (const found of readJson<RawFaction[]>(factionFile)) {
        for (const alias of found.aliases ?? []) factionKeys.set(routeSlug(alias), faction)
        if (found.parent_faction_id) factionParents.set(found.id, found.parent_faction_id)
        factionNames.set(found.id, found.name)
        const icon = path.join(iconDirectory, `${found.id}.svg`)
        if (found.logo_url) {
          const source = fs.existsSync(icon) ? `data:image/svg+xml;base64,${fs.readFileSync(icon).toString('base64')}` : found.logo_url
          factionIcons.set(found.id, source)
          for (const alias of found.aliases ?? []) factionIcons.set(routeSlug(alias), source)
        }
        const own = datacards.factions.get(routeSlug(found.name))?.armyRules.find((card) => routeSlug(card.name) === found.faction_rule_id)
        const description = own?.description ?? (found.faction_rule_id ? datacards.armyRules.get(found.faction_rule_id) : null)
        if (found.faction_rule_id && description) {
          const name =
            own?.name ??
            titleCase(found.faction_rule_id.replaceAll('-', ' ')).replace(/\s(Of|The|And|For|From|In|To)\b/g, (word) => word.toLowerCase())
          const rule = { name, description }
          factionRules.set(found.id, rule)
          for (const alias of found.aliases ?? []) factionRules.set(routeSlug(alias), rule)
        }
      }
    }
  }
  const seenContents = new Set<FactionContent>()
  for (const content of datacards.factions.values()) {
    if (seenContents.has(content)) continue
    seenContents.add(content)
    const keys = datacardsFactionKeys(content.name)
    const existing = [...keys].map((key) => factionKeys.get(key)).find(Boolean)
    if (existing) continue
    const faction = routeSlug(content.name)
    factions.push(faction)
    factionNames.set(faction, content.name)
    factionKeys.set(faction, faction)
    for (const key of keys) factionKeys.set(key, faction)
  }

  for (const faction of factions) {
    const file = path.join(core, faction, 'stratagems.json')
    const referenceFile = path.join(core, faction, 'detachments.json')
    const enhancementFile = path.join(core, faction, 'enhancements.json')
    const rawStratagems = readOptionalList<RawStratagem>(file)
    for (const raw of rawStratagems) dataslate ??= raw.game_version?.dataslate ?? null

    const detachments = new Map<string, Stratagem[]>()

    const rawDetachments = readOptionalList<RawDetachment>(referenceFile)
    const semanticEnhancements = readOptionalList<RawEnhancement>(enhancementFile)
    const cardOf = (detachment: RawDetachment, stratagem: RawStratagem) => {
      const ids = externalIdsFor(sourceReferences.stratagems, stratagem.id, 'game-datacards')
      if (ids.length) {
        const candidates = new Map(
          ids.flatMap((id) => {
            const card = datacards.stratagemsById.get(id)
            return card ? [[JSON.stringify(card), card] as const] : []
          }),
        )
        if (candidates.size) {
          return { card: candidates.size === 1 ? candidates.values().next().value! : null, method: 'external-ref' as const }
        }
      }
      const card = datacards.stratagems.get(descriptionKey(detachment.name, stratagem.name)) ?? null
      return { card, method: card ? ('name' as const) : null }
    }

    const factionName = factionNames.get(faction) ?? faction
    const parentId = factionParents.get(faction) ?? null
    const ownSemantics = { detachments: rawDetachments, enhancements: semanticEnhancements, stratagems: rawStratagems }
    const parentSemantics = parentId
      ? {
          detachments: readOptionalList<RawDetachment>(path.join(core, parentId, 'detachments.json')),
          enhancements: readOptionalList<RawEnhancement>(path.join(core, parentId, 'enhancements.json')),
          stratagems: readOptionalList<RawStratagem>(path.join(core, parentId, 'stratagems.json')),
        }
      : null
    const semanticSources = parentSemantics ? [ownSemantics, parentSemantics] : [ownSemantics]
    const sources = constructionSources(datacards, factionName, parentId)
    const authoritative = authoritativeDetachments(sources)
    const rawDetachmentById = new Map(rawDetachments.map((detachment) => [detachment.id, detachment]))
    const cardsFor = ({ name, source }: { name: string; source: FactionContent }) => enhancementsNamed(source, name)
    const semanticEnhancementFor = (detachment: string, enhancement: ConstructionEnhancement) =>
      semanticEnhancementNamed(semanticSources, detachment, enhancement, sourceReferences)
    const constructionFields = (name: string) => {
      const construction = constructionDetachment(datacards, factionName, name, parentId)
      return { points: construction?.points ?? null, dispositions: construction ? [construction.disposition] : [] }
    }
    for (const detachment of rawDetachments) {
      if (!authoritative.has(joinKey(detachment.name))) {
        constructionJoinIssues.push({ kind: 'detachment', faction: factionName, detachment: detachment.name })
      }
    }
    for (const enhancement of semanticEnhancements) {
      const detachment = enhancement.detachment_id ? rawDetachmentById.get(enhancement.detachment_id) : undefined
      const authoritativeDetachment = detachment ? authoritative.get(joinKey(detachment.name)) : undefined
      const exactIds = new Set(externalIdsFor(sourceReferences.enhancements, enhancement.id, 'game-datacards'))
      const authoritativeCards = authoritativeDetachment ? cardsFor(authoritativeDetachment) : []
      const exactEnhancement = authoritativeCards.find((candidate) => candidate.ids?.some((id) => exactIds.has(id)))
      const constructionEnhancement =
        exactEnhancement ??
        authoritativeCards.find((candidate) => constructionCardKey(candidate.name) === constructionCardKey(enhancement.name))
      if (detachment && !constructionEnhancement) {
        constructionJoinIssues.push({
          kind: 'enhancement',
          faction: factionName,
          detachment: detachment.name,
          enhancement: enhancement.name,
        })
      }
    }

    const references = new Map<string, DetachmentReference>()
    const details = new Map<string, DetachmentRulesDetail>()
    for (const authoritativeDetachment of authoritative.values()) {
      const { name } = authoritativeDetachment
      const semantic = semanticSourceNamed(semanticSources, name)
      if (semantic) sourceJoinFallbacks.push({ kind: 'detachment', faction: factionName, detachment: name })
      const id = semantic?.detachment.id ?? routeSlug(name)
      const cards = cardsFor(authoritativeDetachment).map((enhancement) => ({
        enhancement,
        overlay: semanticEnhancementFor(name, enhancement),
      }))
      const enhancements = cards.filter(
        ({ enhancement, overlay }) => !isUnitUpgrade(enhancement.name) && !isUnitUpgrade(overlay.value?.name ?? ''),
      )
      const upgrades = cards.filter(
        ({ enhancement, overlay }) => isUnitUpgrade(enhancement.name) || isUnitUpgrade(overlay.value?.name ?? ''),
      )
      for (const { enhancement, overlay } of cards) {
        if (overlay.method === 'name') {
          sourceJoinFallbacks.push({ kind: 'enhancement', faction: factionName, detachment: name, name: enhancement.name })
        } else if (overlay.method === 'external-ref' && overlay.value) {
          sourceJoinExacts.push({ kind: 'enhancement', faction: factionName, detachment: name, name: enhancement.name })
        }
      }
      const stratagems = semantic ? detachmentStratagems(semantic.detachment, semantic.source.stratagems) : []
      const stratagemCards = stratagems.map((raw) => ({ raw, match: semantic ? cardOf(semantic.detachment, raw) : null }))
      for (const { raw, match } of stratagemCards) {
        if (match?.method === 'name') {
          sourceJoinFallbacks.push({ kind: 'stratagem', faction: factionName, detachment: name, name: raw.name })
        } else if (match?.method === 'external-ref' && match.card) {
          sourceJoinExacts.push({ kind: 'stratagem', faction: factionName, detachment: name, name: raw.name })
        }
      }
      if (semantic) {
        detachments.set(
          id,
          stratagemCards.map(({ raw, match }) => toStratagem(raw, match?.card?.name)),
        )
      }
      references.set(id, {
        enhancements: enhancements.length,
        upgrades: upgrades.length,
        stratagems: stratagems.length,
        ...constructionFields(name),
      })
      details.set(id, {
        id,
        name,
        ...constructionFields(name),
        rules: [...(authoritativeDetachment.source.detachmentRules.get(joinKey(name)) ?? [])],
        enhancements: enhancements.map(({ enhancement, overlay }) => ({
          name: enhancement.name,
          points: enhancement.points,
          description: enhancement.description,
          keywordRestrictions: overlay.value ? (overlay.value.keyword_restrictions ?? []) : null,
        })),
        upgrades: upgrades.map(({ enhancement }) => ({
          name: enhancement.name.replace(/\s*\(upgrade\)\s*$/i, ''),
          points: enhancement.points,
          description: enhancement.description,
        })),
        stratagems: stratagemCards
          .map(({ raw, match }) => ({
            id: raw.id,
            name: match?.card?.name ?? titleCase(raw.name),
            cp: raw.cp_cost ?? 0,
            type: raw.type ? titleCase(raw.type.replaceAll('-', ' ')) : null,
            phases: raw.phases ?? [],
            turn: raw.player_turn ?? null,
            description: match?.card?.description ?? null,
          }))
          .toSorted(byName),
      })
    }
    detachmentReferences.set(faction, references)
    detachmentDetails.set(faction, details)
    if (detachments.size) byDetachment.set(faction, detachments)
  }

  for (const { id, logoUrl } of SUPPLEMENTAL_FACTION_ICONS) {
    if (factionIcons.has(id)) continue
    const icon = path.join(iconDirectory, `${id}.svg`)
    factionIcons.set(id, fs.existsSync(icon) ? `data:image/svg+xml;base64,${fs.readFileSync(icon).toString('base64')}` : logoUrl)
  }

  return {
    factionNames,
    factionIcons,
    factionRules,
    factionKeys,
    factionParents,
    detachmentReferences,
    detachmentDetails,
    byDetachment,
    dataslate,
    constructionJoinIssues,
    sourceJoinFallbacks,
    sourceJoinExacts,
  }
}
