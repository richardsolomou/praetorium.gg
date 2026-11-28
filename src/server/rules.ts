import { absentDetachmentRuleKeys } from './absentAbilities'
import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { uniqueBy } from '../core/collections'
import { loadDatacardsSteps } from './datacards'
import { factionRestrictions } from '../shared/datacards'
import { factionsFromDatacards } from './datacardFactions'
import { missionTerrain } from './missionTerrain'
import { kotcTerrain } from './kotcTerrain'
import { combatPatrolTerrain } from './combatPatrolTerrain'
import { readVsDataRelease } from './vsDataSummaries'
import { vsDataMissions } from './vsDataMissions'
import { vsDataStratagems } from './vsDataStratagems'
import { vsDataIndex } from '../shared/vsData'
import { importNamesOf } from '../shared/importNames'
import { legacyImportIds } from './legacyNames'
import { vsDataRuleDocuments } from '../shared/ruleDocuments'
import { formerRuleIds } from '../core/legacyRuleIds'
import { catalogueDirectory } from './catalogueIndex'
import { type LoadedCatalogue } from '../shared/catalogueIndex'
import { missingArmyRulesFromCatalogueSteps } from './catalogueArmyRules'
import { withDefinitionTokens } from './sourceTexts'
import { joinKey } from '../core/text'
import { type LoadedRules } from '../shared/rules'
import { completeSteps, type Steps } from '../shared/steps'
export function loadRules(...args: Parameters<typeof loadRulesSteps>): LoadedRules | null {
  return completeSteps(loadRulesSteps(...args))
}

export function* loadRulesSteps(
  directory = catalogueDirectory(),
  {
    battlemasterDirectory = path.join(directory, 'battlemaster'),
    iconDirectory = fs.existsSync(path.join(directory, 'icons')) ? path.join(directory, 'icons') : path.join(directory, 'faction-icons'),
    datacardsDirectory = path.join(directory, 'datacards', '11th', 'gdc'),
    snapshotDirectory = directory,
    rulesVersion,
    catalogue,
  }: {
    battlemasterDirectory?: string
    iconDirectory?: string
    datacardsDirectory?: string
    /** The snapshot root, holding the VS Data releases and the composition that says where its files live upstream. */
    snapshotDirectory?: string
    /** The rules version whose Stratagems these rules read. */
    rulesVersion?: string
    /** The catalogue already read, whose cards are parsed once and whose tokens the army rules read from its files take. */
    catalogue?: Pick<LoadedCatalogue, 'datacards' | 'definitions'>
  } = {},
): Steps<LoadedRules | null> {
  const datacards = catalogue?.datacards ?? (yield* loadDatacardsSteps(datacardsDirectory))
  // Missions are the current pack's whatever the rules version. Stratagems are the rules version's own, each Detachment's
  // the ones its release lists for it; a listed card its release does not type plays as the base release types it.
  const vsData = readVsDataRelease(snapshotDirectory)
  const releases = [rulesVersion ? readVsDataRelease(snapshotDirectory, rulesVersion) : null, vsData].filter((release) => release !== null)
  const pools = releases.map((release) => vsDataStratagems(release.stratagems, release.detachments))
  const indexes = releases.map((release) => vsDataIndex(release.entries))
  // The card's wording as tokens, read through the Game Datacards IDs VS Data aliases, for the simulator and keyword links.
  const describe = (key: string) =>
    indexes
      .flatMap((index) => index.aliasesOf({ kind: 'ability', id: key }))
      .map((alias) => datacards.stratagemTexts.get(alias.replace(/^gdc\.(?:core\.)?stratagem\./, '').replaceAll('.', '-')))
      .find(Boolean) ?? null
  const printed = <Card extends { key: string }>(cards: Card[][]) =>
    uniqueBy(
      cards.flatMap((list, at) => (at ? list.filter((card) => describe(card.key)) : list)),
      (card) => card.key,
    )
  const contents = [...new Set(datacards.factions.values())]
  const printedStratagems = contents.flatMap((content) =>
    (content.stratagemCards ?? []).map((print) => ({ ...print, faction: content.name })),
  )
  // The factions printing a Detachment and the one whose own it is, as a Dark Angels file prints the Space Marines'
  // Ironstorm Spearhead, then the faction each belongs to, as the Space Marines print the cards a Dark Angels Detachment
  // shares with them.
  const owners = (name: string) => {
    const owning = contents.flatMap((content) =>
      [...content.detachments].flatMap((detachment) =>
        joinKey(detachment) === joinKey(name) ? [content.name, content.detachmentFactions?.get(detachment) ?? content.name] : [],
      ),
    )
    const parents = contents.flatMap((content) => (owning.includes(content.name) && content.parentName ? [content.parentName] : []))
    return new Set([...owning, ...parents].map(joinKey))
  }
  const inDetachment = (name: string) => {
    const [own, base] = pools
    const listing = own?.listing(name)
    if (listing?.absent) return { cards: [], unlisted: [], listing }
    // A Detachment the release does not list fills in from its namesake in the base release where the rules version's
    // Game Datacards files print the card, until VS Data lists every Detachment those files carry.
    if (!own || !listing)
      return { cards: own ? printed([own.inDetachment(name), base?.inDetachment(name) ?? []]) : [], unlisted: [], listing: null }
    const typed = (id: string) => own.byId(id) ?? base?.byId(id)
    const listed = listing.stratagems.flatMap((id) => typed(id) ?? [])
    // A card the build prints that the release does not publish plays as a release types the Game Datacards card of
    // that name, the one this Detachment prints first, then one its own faction prints, as another faction's card of the
    // name can name its own units; one no release types stays a name.
    const owning = owners(name)
    const unlisted = listing.stratagemsUnlisted.map((card) => {
      const named = printedStratagems.filter((print) => joinKey(print.name) === joinKey(card))
      const ids = [
        ...named.filter((print) => joinKey(print.detachment ?? '') === joinKey(name)),
        ...named.filter((print) => owning.has(joinKey(print.faction))),
        ...named,
      ].map((print) => print.id)
      const ref = ids
        .map((id) => indexes.map((index) => index.entry([`gdc.stratagem.${id.replaceAll('-', '.')}`])).find(Boolean))
        .find(Boolean)
      return (ref && typed(ref.id)) ?? card
    })
    return {
      cards: uniqueBy([...listed, ...unlisted.filter((card) => typeof card !== 'string')], (card) => card.key),
      unlisted: unlisted.filter((card) => typeof card === 'string'),
      listing,
    }
  }
  // The Game Datacards IDs of the Enhancements a release lists, through the aliases VS Data gives them.
  const enhancementIds = (ids: readonly string[]) =>
    ids.flatMap((id) =>
      indexes
        .flatMap((index) => index.aliasesOf({ kind: 'ability', id }))
        .flatMap((alias) => (alias.startsWith('gdc.enhancement.') ? [alias.slice('gdc.enhancement.'.length).replaceAll('.', '-')] : [])),
    )
  const core = printed(pools.map((pool) => pool.core))
  const absentRules = absentDetachmentRuleKeys(releases[0] ?? null)
  const factions = factionsFromDatacards(
    datacards,
    iconDirectory,
    (name) => {
      const { cards, unlisted, listing } = inDetachment(name)
      if (listing?.absent) return { absent: true, stratagems: [] }
      return {
        stratagems: cards.map((card) => ({ ...card, description: describe(card.key) })),
        ...(listing
          ? {
              stratagemsUnlisted: unlisted,
              enhancements: new Set(enhancementIds(listing.enhancements)),
              enhancementsUnlisted: listing.enhancementsUnlisted,
            }
          : {}),
      }
    },
    absentRules,
    // The rules version's own release first, as for its Stratagems, then the base's.
    (aliases) => indexes.flatMap((index) => index.entry(aliases) ?? []).find((ref) => ref.kind === 'ability')?.id,
  )
  const missing = yield* missingArmyRulesFromCatalogueSteps(path.join(directory, 'definitions'), datacards)
  const catalogueRules = catalogue?.definitions ? withDefinitionTokens(missing, catalogue.definitions.token) : missing
  // A core ability a faction lists among its army rules, as the Adeptus Titanicus list Super-heavy Walker, is VS Data's.
  const coreAbilities = new Set(
    Object.entries(releases[0]?.keywords ?? {}).flatMap(([key, name]) => (key.startsWith('core-ability:') ? [joinKey(name)] : [])),
  )
  const supplementalArmyRules = new Map(catalogueRules)
  for (const content of new Set(datacards.factions.values())) {
    const faction = routeSlug(content.name)
    const sourceRules = catalogueRules.get(faction) ?? []
    const keywordMissing = [...content.factionAbilityNames].flatMap((name) => {
      if (content.armyRules.some((rule) => routeSlug(rule.name) === routeSlug(name))) return []
      return coreAbilities.has(joinKey(name)) ? [{ name, description: '' }] : []
    })
    const preferred = new Set(keywordMissing.map((rule) => routeSlug(rule.name)))
    const selected = [...keywordMissing, ...sourceRules.filter((rule) => !preferred.has(routeSlug(rule.name)))]
    if (selected.length) supplementalArmyRules.set(faction, selected)
  }
  const packs = vsData?.missionPacks ?? []
  const missions = vsDataMissions(packs, vsData?.missionActions ?? [])
  yield
  const { terrainLayouts, deployments } = missionTerrain(packs, battlemasterDirectory)
  yield
  for (const kotc of kotcTerrain(vsData?.terrain ?? [])) {
    deployments.push(kotc.deployment)
    terrainLayouts.push(kotc.layout)
  }
  const patrol = combatPatrolTerrain(packs, battlemasterDirectory)
  deployments.push(...patrol.deployments)
  terrainLayouts.push(...patrol.terrainLayouts)

  // The dataset is optional, and an instance without its two headline parts has
  // nothing to offer from it. Reporting that is what lets the app fall back cleanly.
  if (!factions.byDetachment.size && !missions.secondaries.length) return null

  const abilityDescriptions = new Map(datacards.armyRules)
  for (const rules of supplementalArmyRules.values()) {
    for (const rule of rules) {
      const key = routeSlug(rule.name)
      if (!abilityDescriptions.has(key)) abilityDescriptions.set(key, rule.description)
    }
  }
  return {
    abilityDescriptions,
    factionRestrictions: factionRestrictions(datacards),
    factionKeys: factions.factionKeys,
    factionParents: factions.factionParents,
    byDetachment: factions.byDetachment,
    detachmentReferences: factions.detachmentReferences,
    detachmentDetails: factions.detachmentDetails,
    factionNames: factions.factionNames,
    factionIcons: factions.factionIcons,
    factionRules: factions.factionRules,
    supplementalArmyRules,
    core: core.map(({ type: _type, ...card }) => card),
    coreDetails: core.flatMap((card) => {
      const description = describe(card.key)
      return description ? [{ id: card.key, type: card.type, description }] : []
    }),
    ruleDocuments: vsDataRuleDocuments(
      releases[0]?.coreRules ?? [],
      // The rules version's own CP wins over the base release's, as later entries of the map do.
      releases.toReversed().flatMap((release) => release.stratagems),
      formerRuleIds,
    ),
    ...missions,
    deployments,
    terrainLayouts,
    terrainTemplates: [],
    dataslate: null,
    // A list is read in the rules version it is imported into, which the release beside the base one describes.
    importNames: importNamesOf(releases[0]?.names, releases[0]?.entries ?? {}, legacyImportIds, rulesVersion),
    ...(releases[0]?.dataBuild ? { appDataBuild: releases[0].dataBuild } : {}),
  }
}
