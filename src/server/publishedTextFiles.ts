import { transformed } from '../shared/datacards'
import { resolvedText } from '../core/sourceText'
import type { ScannableTextLocations } from './referenceCorpus'
import { readCatalogueComposition } from './catalogueComposition'
import { catalogueDirectory } from './catalogueIndex'
import { memoUntilSnapshotChanges } from './snapshotMemo'
import { recordIdsIn, stringsByHash, textFileId, textFileIdsIn, textFilesFrom, textRecordsSteps, textSourcePaths } from './sourceTexts'
import { completeStepsCooperatively } from './canonicalCatalogue'
import { RecentlyUsed, remember } from '../core/collections'
import { completeSteps } from '../shared/steps'

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

/** Where each file a rules-text token names lives upstream, for the active snapshot; Praetorium serves where the words are, never the words. */
export const publishedTextFiles = async () => (await located()).files

/** Those files, and which records each holds, for answers that point agents at withheld text. */
export const publishedTextLocations = located

// A calculation reads a faction's file or two; holding every file read would keep the whole snapshot's words.
const HELD_FILES = 8

/**
 * The words behind a text's tokens, read from the active snapshot so the server can calculate from them,
 * or null when a token names no string it holds. What is calculated may leave the server; the words never do.
 */
export const serverWords = () =>
  memoUntilSnapshotChanges('text-words', null, async () => {
    const directory = catalogueDirectory()
    const files = new Map(textSourcePaths(directory, readCatalogueComposition(directory)).map((file) => [textFileId(file.url), file.path]))
    const held = new RecentlyUsed<string, ReadonlyMap<string, string>>(HELD_FILES)
    const stringsIn = (file: string) => remember(held, file, () => stringsByHash(file))
    return (text: string): string | null => {
      let complete = true
      const words = resolvedText(
        text,
        ({ file, transform, hash }) => {
          const found = files.get(file)
          const raw = found === undefined ? undefined : stringsIn(found).get(hash)
          return raw === undefined ? null : transformed(raw, transform)
        },
        () => {
          complete = false
          return ''
        },
      )
      return complete ? words : null
    }
  })
