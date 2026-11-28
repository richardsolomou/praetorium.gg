import { app } from './app'
import { memoUntilSnapshotChanges } from './snapshotMemo'
import { catalogueDirectory } from './catalogueIndex'
import { completeStepsCooperatively } from './canonicalCatalogue'
import { vsDataSummariesSteps } from './vsDataSummaries'
import { catalogueEditionId } from '../core/catalogueEdition'
import { type TextLocations, textTokensIn } from '../core/sourceText'
import { textHomeOf } from './publishedTextFiles'
import { printedRuleSummary, ruleSummaryFinder } from './referenceSummaries'
import { unitsInBook } from '../shared/vsDataAbilities'

/** The pinned VS Data releases this snapshot serves, read once until the snapshot changes. */
export const servedVsDataSummaries = () =>
  memoUntilSnapshotChanges('vs-data-summaries', null, async () => {
    const [canonical, rules] = await Promise.all([app().canonicalCatalogueFor(), app().rulesFor()])
    const documents = canonical?.ruleDocuments ?? rules?.ruleDocuments ?? []
    return completeStepsCooperatively(vsDataSummariesSteps(catalogueDirectory(), documents))
  })

/** What VS Data says of the units of a catalogue's rules version, as datasheets and combatants read it. */
export const servedVsDataUnits = async (catalogueId: string) => {
  const units = (await servedVsDataSummaries())?.unitsIn(catalogueEditionId(catalogueId))
  return units && unitsInBook(units, catalogueId)
}

/**
 * `printedRuleSummary` for one answer, which reads where strings live now only when the answer names a file the snapshot
 * replaced, as only a battle or reminder saved before a data update does, so no other answer waits for that index.
 */
export async function answerRuleSummary(answer: unknown, locations: TextLocations) {
  const replaced = textTokensIn(JSON.stringify(answer) ?? '').some((token) => !(token.file in locations.files))
  const [summaries, homeOf] = await Promise.all([servedVsDataSummaries(), replaced ? textHomeOf() : null])
  return printedRuleSummary(ruleSummaryFinder(summaries, homeOf ? { homeOf, files: locations.files } : undefined))
}
