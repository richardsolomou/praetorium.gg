import { app } from './app'
import { memoUntilSnapshotChanges } from './snapshotMemo'
import { catalogueDirectory } from './catalogueIndex'
import { completeStepsCooperatively } from './canonicalCatalogue'
import { vsDataSummariesSteps } from './vsDataSummaries'
import { catalogueEditionId } from '../core/catalogueEdition'

/** The pinned VS Data releases this snapshot serves, read once until the snapshot changes. */
export const servedVsDataSummaries = () =>
  memoUntilSnapshotChanges('vs-data-summaries', null, async () => {
    const [canonical, rules] = await Promise.all([app().canonicalCatalogueFor(), app().rulesFor()])
    const documents = canonical?.ruleDocuments ?? rules?.ruleDocuments ?? []
    return completeStepsCooperatively(vsDataSummariesSteps(catalogueDirectory(), documents))
  })

/** What VS Data says of the units of a catalogue's rules version, as datasheets and combatants read it. */
export const servedVsDataUnits = async (catalogueId: string) => (await servedVsDataSummaries())?.unitsIn(catalogueEditionId(catalogueId))
