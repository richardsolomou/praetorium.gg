import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import { routeSlug } from '../core/slug'
import { byName, factionDirectories, readJson, readOptionalList, titleCase } from './rulesSource'
import { type RawStratagem, toStratagem } from './rulesCards'
import { descriptionKey, type LoadedDatacards } from './datacards'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'

/**
 * Who the factions are, and what each of their detachments brings.
 *
 * Names, icons and army rules from the licensed dataset; the prose that describes a
 * detachment ability, enhancement or stratagem from Game Datacards. Everything is
 * keyed by the faction directory the dataset uses, which is also the slug the app
 * routes reference pages by.
 */

type RawFaction = { id: string; name: string; aliases?: string[]; faction_rule_id?: string; logo_url?: string }

type RawDetachment = {
  id: string
  name: string
  enhancement_ids?: string[]
  stratagem_ids?: string[]
  detachment_points?: number
  force_dispositions?: string[]
}

type RawEnhancement = { id: string; name: string; detachment_id?: string; cost?: number; keyword_restrictions?: string[] }
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
  enhancements: { name: string; points: number | null; description: string | null; keywordRestrictions: string[] }[]
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
  /** Display metadata for each detachment, from the same licensed source as its stratagems. */
  detachmentReferences: Map<string, Map<string, DetachmentReference>>
  detachmentDetails: Map<string, Map<string, DetachmentRulesDetail>>
  /** Faction slug then detachment slug, so a chosen detachment maps straight to its six. */
  byDetachment: Map<string, Map<string, Stratagem[]>>
  /** Whatever the dataset says about how settled these numbers are. */
  dataslate: string | null
}

export function loadFactions(core: string, iconDirectory: string, datacards: LoadedDatacards): LoadedFactions {
  const byDetachment = new Map<string, Map<string, Stratagem[]>>()
  const detachmentReferences = new Map<string, Map<string, DetachmentReference>>()
  const detachmentDetails = new Map<string, Map<string, DetachmentRulesDetail>>()
  const factionNames = new Map<string, string>()
  const factionIcons = new Map<string, string>()
  const factionRules = new Map<string, { name: string; description: string }>()
  const factionKeys = new Map<string, string>()
  let dataslate: string | null = null

  for (const faction of factionDirectories(core)) {
    const file = path.join(core, faction, 'stratagems.json')
    const factionFile = path.join(core, faction, 'factions.json')
    factionKeys.set(faction, faction)
    if (fs.existsSync(factionFile)) {
      for (const found of readJson<RawFaction[]>(factionFile)) {
        for (const alias of found.aliases ?? []) factionKeys.set(routeSlug(alias), faction)
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
    const referenceFile = path.join(core, faction, 'detachments.json')
    const enhancementFile = path.join(core, faction, 'enhancements.json')
    const rawStratagems = readOptionalList<RawStratagem>(file)

    const detachments = new Map<string, Stratagem[]>()
    for (const raw of rawStratagems) {
      dataslate ??= raw.game_version?.dataslate ?? null
      if (!raw.detachment_id) continue
      detachments.set(raw.detachment_id, [...(detachments.get(raw.detachment_id) ?? []), toStratagem(raw)])
    }

    if (fs.existsSync(referenceFile)) {
      const rawDetachments = readJson<RawDetachment[]>(referenceFile)
      const enhancements = fs.existsSync(enhancementFile) ? readJson<RawEnhancement[]>(enhancementFile) : []
      const stratagemsOf = new Map(rawDetachments.map((detachment) => [detachment.id, detachmentStratagems(detachment, rawStratagems)]))
      const cardOf = (detachment: RawDetachment, stratagem: RawStratagem) =>
        datacards.stratagems.get(descriptionKey(detachment.name, stratagem.name))
      for (const detachment of rawDetachments) {
        detachments.set(
          detachment.id,
          (stratagemsOf.get(detachment.id) ?? []).map((raw) => toStratagem(raw, cardOf(detachment, raw)?.name)),
        )
      }

      const references = new Map(
        rawDetachments.map((detachment) => [
          detachment.id,
          {
            enhancements: enhancements.filter(
              (enhancement) => enhancement.detachment_id === detachment.id && !isUnitUpgrade(enhancement.name),
            ).length,
            upgrades: enhancements.filter((enhancement) => enhancement.detachment_id === detachment.id && isUnitUpgrade(enhancement.name))
              .length,
            stratagems: stratagemsOf.get(detachment.id)?.length ?? 0,
            points: detachment.detachment_points ?? null,
            dispositions: detachment.force_dispositions ?? [],
          },
        ]),
      )
      const details = new Map(
        rawDetachments.map((detachment) => [
          detachment.id,
          {
            id: detachment.id,
            name: detachment.name,
            points: detachment.detachment_points ?? null,
            dispositions: detachment.force_dispositions ?? [],
            rules: [...(datacards.detachmentRules.get(routeSlug(detachment.name)) ?? [])],
            enhancements: enhancements
              .filter((enhancement) => enhancement.detachment_id === detachment.id && !isUnitUpgrade(enhancement.name))
              .map((enhancement) => ({
                name: enhancement.name,
                points: enhancement.cost ?? null,
                description: datacards.enhancements.get(descriptionKey(detachment.name, enhancement.name)) ?? null,
                keywordRestrictions: enhancement.keyword_restrictions ?? [],
              })),
            upgrades: enhancements
              .filter((enhancement) => enhancement.detachment_id === detachment.id && isUnitUpgrade(enhancement.name))
              .map((enhancement) => ({
                name: enhancement.name.replace(/\s*\(upgrade\)\s*$/i, ''),
                points: enhancement.cost ?? null,
                description: datacards.enhancements.get(descriptionKey(detachment.name, enhancement.name)) ?? null,
              })),
            stratagems: (stratagemsOf.get(detachment.id) ?? [])
              .map((stratagem) => ({
                id: stratagem.id,
                name: cardOf(detachment, stratagem)?.name ?? titleCase(stratagem.name),
                cp: stratagem.cp_cost ?? 0,
                type: stratagem.type ? titleCase(stratagem.type.replaceAll('-', ' ')) : null,
                phases: stratagem.phases ?? [],
                turn: stratagem.player_turn ?? null,
                description: cardOf(detachment, stratagem)?.description ?? null,
              }))
              .toSorted(byName),
          },
        ]),
      )
      detachmentReferences.set(faction, references)
      detachmentDetails.set(faction, details)
    }
    if (detachments.size) byDetachment.set(faction, detachments)
  }

  for (const { id, logoUrl } of SUPPLEMENTAL_FACTION_ICONS) {
    if (factionIcons.has(id)) continue
    const icon = path.join(iconDirectory, `${id}.svg`)
    factionIcons.set(id, fs.existsSync(icon) ? `data:image/svg+xml;base64,${fs.readFileSync(icon).toString('base64')}` : logoUrl)
  }

  return { factionNames, factionIcons, factionRules, factionKeys, detachmentReferences, detachmentDetails, byDetachment, dataslate }
}
