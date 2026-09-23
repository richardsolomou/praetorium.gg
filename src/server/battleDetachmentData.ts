import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'
import { rulesReferencedIn } from './catalogueRules'
import { rulesFaction, type LoadedRules } from './rules'
import { selectedDetachmentRules } from './selectedDetachmentRules'
import { isProfiledDetachment, profiledDetachmentCards } from './catalogueProfileRules'

export type BattleDetachmentData = {
  index: Pick<LoadedCatalogue['index'], 'rules'>
  live: NonNullable<ReturnType<LoadedRules['byDetachment']['get']>>
  details: NonNullable<ReturnType<LoadedRules['detachmentDetails']['get']>>
  core: LoadedRules['core']
  coreDetails: LoadedRules['coreDetails']
  attribution: string
  dataslate: string | null
  profiledStratagems: Map<string, ReturnType<typeof profiledDetachmentCards>['stratagems']>
}

export function battleDetachmentData(
  loaded: Pick<LoadedCatalogue, 'index' | 'detachments' | 'profiledDetachmentIds'>,
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
    profiledStratagems: new Map(
      (loaded.detachments.get(catalogueId)?.options ?? [])
        .filter((option) => isProfiledDetachment(loaded, option.id))
        .map((option) => [option.name, profiledDetachmentCards(loaded, option.id).stratagems]),
    ),
  }
}

export function selectedBattleDetachmentData(data: BattleDetachmentData, names: readonly string[]) {
  const selected = selectedDetachmentRules(
    names.filter((name) => !data.profiledStratagems.has(name)),
    data.live,
    data.details,
  )
  const previewWritten = names.flatMap((name) =>
    (data.profiledStratagems.get(name) ?? []).map((card) => ({ ...card, type: null })),
  )
  const written = [...selected.written, ...previewWritten, ...data.coreDetails]
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
