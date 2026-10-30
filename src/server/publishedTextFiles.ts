import type { TextLocations } from '../shared/sourceText'
import { readCatalogueComposition } from './catalogueComposition'
import { catalogueDirectory } from './catalogueIndex'
import { memoUntilSnapshotChanges } from './snapshotMemo'
import { recordIdsIn, textFilesFrom, textRecordsIn, textSourcePaths } from './sourceTexts'
import { remember } from '../core/collections'

const located = () =>
  memoUntilSnapshotChanges('text-locations', null, async () => {
    const directory = catalogueDirectory()
    const paths = textSourcePaths(directory, readCatalogueComposition(directory))
    const local = new Map(paths.map((file) => [file.url, file.path]))
    const ids = new Map<string, ReadonlySet<string>>()
    const records = new Map<string, ReadonlyMap<string, readonly string[]>>()
    const holds = (url: string, id: string) => {
      const file = local.get(url)
      if (!file) return false
      return remember(ids, url, () => recordIdsIn(file)).has(id)
    }
    const recordsHolding = (url: string, hash: string) => {
      const file = local.get(url)
      return (file && remember(records, url, () => textRecordsIn(file)).get(hash)) || []
    }
    return { files: textFilesFrom(paths), holds, recordsHolding } satisfies TextLocations
  })

/** Where each file a rules-text token names lives upstream, for the active snapshot; Praetorium serves where the words are, never the words. */
export const publishedTextFiles = async () => (await located()).files

/** Those files, and which records each holds, for answers that point agents at withheld text. */
export const publishedTextLocations = located
