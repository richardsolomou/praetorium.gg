import { transformed } from '../shared/datacards'
import { resolvedText, type TextLocations } from '../shared/sourceText'
import { readCatalogueComposition } from './catalogueComposition'
import { catalogueDirectory } from './catalogueIndex'
import { memoUntilSnapshotChanges } from './snapshotMemo'
import { recordIdsIn, stringsByHash, textFileId, textFilesFrom, textRecordsIn, textSourcePaths } from './sourceTexts'
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
    const held = new Map<string, ReadonlyMap<string, string>>()
    const stringsIn = (file: string) => {
      const strings = held.get(file) ?? stringsByHash(file)
      held.delete(file)
      held.set(file, strings)
      if (held.size > HELD_FILES) held.delete(held.keys().next().value!)
      return strings
    }
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
