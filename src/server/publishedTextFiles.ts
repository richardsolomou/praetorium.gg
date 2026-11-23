import type { ScannableTextLocations } from './referenceCorpus'
import { readCatalogueComposition } from './catalogueComposition'
import { catalogueDirectory } from './catalogueIndex'
import { memoUntilSnapshotChanges } from './snapshotMemo'
import { recordIdsIn, snapshotWords, textFileIdsIn, textFilesFrom, textRecordsSteps, textSourcePaths } from './sourceTexts'
import { completeStepsCooperatively } from './canonicalCatalogue'
import { remember } from '../core/collections'
import { completeSteps } from '../shared/steps'

/** Where each file a rules-text token names lives upstream and which records each holds, for answers that point agents at withheld text. */
export const publishedTextLocations = () =>
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
      return (file && remember(records, url, () => completeSteps(textRecordsSteps(file))).get(hash)) || []
    }
    const files = textFilesFrom(paths)
    // A snapshot's stored editions hold far more files than any one catalogue names, so only those named are read.
    const scanFilesNamedIn = async (values: readonly unknown[]) => {
      for (const id of await completeStepsCooperatively(textFileIdsIn(values))) {
        const url = files[id]?.url
        const file = url && local.get(url)
        if (file && !records.has(url)) records.set(url, await completeStepsCooperatively(textRecordsSteps(file)))
      }
    }
    return { files, holds, recordsHolding, scanFilesNamedIn } satisfies ScannableTextLocations
  })

/** Just those upstream files for the active snapshot; Praetorium serves where the words are, never the words. */
export const publishedTextFiles = async () => (await publishedTextLocations()).files

/**
 * The words behind a text's tokens, read from the active snapshot so the server can calculate from them,
 * or null when a token names no string it holds. What is calculated may leave the server; the words never do.
 */
export const serverWords = () => memoUntilSnapshotChanges('text-words', null, async () => snapshotWords(catalogueDirectory()))
