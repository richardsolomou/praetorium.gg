import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'
import { rulesReferencedIn } from './catalogueRules'
import { rulesFaction, type LoadedRules } from './rules'
import { selectedDetachmentRules } from './selectedDetachmentRules'

export type BattleDetachmentData = {
  index: Pick<LoadedCatalogue['index'], 'rules'>
  live: NonNullable<ReturnType<LoadedRules['byDetachment']['get']>>
  details: NonNullable<ReturnType<LoadedRules['detachmentDetails']['get']>>
  core: LoadedRules['core']
  coreDetails: LoadedRules['coreDetails']
  attribution: string
  dataslate: string | null
}

export function battleDetachmentData(
  loaded: Pick<LoadedCatalogue, 'index'>,
  rules: LoadedRules,
  catalogueId: string,
): BattleDetachmentData | null {
  const book = loaded.index.catalogues.get(catalogueId)
  if (!book) return null
  const rulesId = rulesFaction(rules, routeSlug(book.name))
  return {
    index: { rules: loaded.index.rules },
    live: rules.byDetachment.get(rulesId) ?? new Map(),
    details: rules.detachmentDetails.get(rulesId) ?? new Map(),
    core: rules.core,
    coreDetails: rules.coreDetails,
    attribution: rules.attribution,
    dataslate: rules.dataslate,
  }
}

export function selectedBattleDetachmentData(data: BattleDetachmentData, names: readonly string[]) {
  const selected = selectedDetachmentRules(names, data.live, data.details)
  const written = [...selected.written, ...data.coreDetails]
  return {
    attribution: data.attribution,
    dataslate: data.dataslate,
    stratagems: selected.live,
    core: data.core,
    written: written.map(({ id, type, description }) => ({ key: id, type, description })),
    keywordRules: rulesReferencedIn(
      data,
      written.map((stratagem) => stratagem.description),
    ),
  }
}
