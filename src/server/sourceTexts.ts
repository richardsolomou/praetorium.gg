import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { remember } from '../core/collections'
import { type CatalogueComposition, readCatalogueComposition } from './catalogueComposition'
import { type CatalogueSourceConfig, catalogueSources } from './catalogueSources'
import { type SourceTexts, TEXT_HASH_LENGTH, type TextSource, type TextSourceFile, textToken } from '../shared/sourceText'

export type { SourceTexts }

/**
 * A token names a file by a hash of where it lives upstream: rules versions copy most files
 * unchanged, and one upstream file must give one token wherever a snapshot holds a copy.
 */
export const textFileId = (upstream: string) => hash('sha256', upstream).slice(0, 8)

/** Tokens for the strings of one file, named by its upstream address, or by its snapshot path where it has none. */
export function sourceTexts(upstream: string): SourceTexts {
  const file = textFileId(upstream)
  return (raw, transform) => textToken({ file, transform, hash: hash('sha256', raw).slice(0, TEXT_HASH_LENGTH) })
}

const SNAPSHOT_FILE = /(?:^|\/)((?:editions\/[^/]+\/)?(?:definitions|points|datacards)\/.+)$/

/**
 * Tokens for the strings of a file the server reads from a snapshot, wherever that
 * snapshot is unpacked: the token names the file by its path within the snapshot.
 */
export const publishedTexts = (file: string): SourceTexts => {
  const normalized = file.split(path.sep).join('/')
  const relative = SNAPSHOT_FILE.exec(normalized)?.[1]
  if (!relative) return sourceTexts(normalized)
  const root = normalized.slice(0, normalized.length - relative.length)
  return sourceTexts(upstreamOf(root)(relative) ?? relative)
}

/** Each snapshot root's addresses, read once: every file a parser reads asks. */
const roots = new Map<string, (file: string) => string | null>()
function upstreamOf(root: string) {
  return remember(roots, root, () => {
    const composition = fs.existsSync(path.join(root, 'composition.json')) ? readCatalogueComposition(root) : null
    const retained = retainedSnapshots(root)
    const answered = new Map<string, string | null>()
    return (file: string) => remember(answered, file, () => upstreamUrl(file, composition, retained))
  })
}

type Origin = { repository: string; revision: string }
const SOURCE = /^(?:editions\/([^/]+)\/)?(definitions|points|datacards)\/(.+)$/

/**
 * The pinned upstream file a snapshot file was copied from, as materialization chose it:
 * an overlay naming the file, else the edition's replacement source, else the root's.
 *
 * Null for a file no upstream holds as-is: a retained edition copied whole from an older
 * snapshot, or a path outside the three text sources. Corrections Praetorium applies are
 * not upstream either, so a corrected string finds no match and stays unavailable.
 */
export function upstreamUrl(
  snapshotFile: string,
  composition: CatalogueComposition | null,
  retained: (editionId: string) => RetainedSnapshot | null = () => null,
  base: CatalogueSourceConfig = composition?.baseSources ?? catalogueSources,
): string | null {
  const [, editionId, source, file] = SOURCE.exec(snapshotFile) ?? []
  if (!source || !file) return null
  const name = source as 'definitions' | 'points' | 'datacards'
  const overlaid = (overlays: CatalogueComposition['overlays']) =>
    overlays.find((overlay) => overlay.source === name && overlay.files.includes(file))
  const root = (): Origin => overlaid(composition?.overlays ?? []) ?? base[name]
  let origin: Origin | null = root()
  if (editionId) {
    const edition = composition?.editions.find((candidate) => candidate.edition.id === editionId)
    if (edition?.snapshot) return retainedUrl(`${source}/${file}`, retained(editionId), base)
    origin = edition ? (overlaid(edition.overlays) ?? edition.sources[name] ?? root()) : null
  }
  return origin ? `https://raw.githubusercontent.com/${origin.repository}/${origin.revision}/${file}` : null
}

/** A rules version kept whole from an older snapshot: that snapshot's own composition, or the revisions it recorded. */
type RetainedSnapshot = { composition: CatalogueComposition | null; revisions: Readonly<Record<string, string>> }

/**
 * A retained snapshot's file read from the sources it was built from: its own composition
 * where it kept one, else the commit it recorded on the root's repository. A recorded
 * revision that is a hash of corrections names no upstream commit, and has no address.
 */
function retainedUrl(snapshotFile: string, snapshot: RetainedSnapshot | null, base: CatalogueSourceConfig) {
  if (!snapshot) return null
  if (snapshot.composition) return upstreamUrl(snapshotFile, snapshot.composition)
  const [, source, file] = /^(definitions|points|datacards)\/(.+)$/.exec(snapshotFile) ?? []
  const revision = source ? snapshot.revisions[source] : undefined
  if (!source || !file || !revision || !/^[0-9a-f]{40}$/.test(revision)) return null
  return `https://raw.githubusercontent.com/${base[source as 'definitions' | 'points' | 'datacards'].repository}/${revision}/${file}`
}

const readJson = (file: string): unknown => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)

/** The retained snapshots a snapshot root holds, read from their own files. */
export const retainedSnapshots =
  (root: string) =>
  (editionId: string): RetainedSnapshot | null => {
    const directory = path.join(root, 'editions', editionId)
    const revisions = readJson(path.join(directory, 'revision.json'))
    if (!revisions || typeof revisions !== 'object') return null
    return {
      composition: fs.existsSync(path.join(directory, 'composition.json')) ? readCatalogueComposition(directory) : null,
      revisions: revisions as Record<string, string>,
    }
  }

/** Each JSON file of the text sources a snapshot holds, at the root and in every rules version, with where it lives upstream. */
export function textSourcePaths(root: string, composition: CatalogueComposition | null) {
  const found: (TextSourceFile & { path: string })[] = []
  const retained = retainedSnapshots(root)
  const visit = (directory: string, source: TextSource) => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`
      if (entry.isDirectory()) visit(file, source)
      else if (entry.name.endsWith('.json')) {
        const url = upstreamUrl(file, composition, retained)
        if (url) found.push({ url, source, path: path.join(root, file) })
      }
    }
  }
  const editions = fs.existsSync(path.join(root, 'editions')) ? fs.readdirSync(path.join(root, 'editions')) : []
  // A file belongs to the source whose place in the snapshot it holds, whichever repository a correction or fork serves it from.
  for (const prefix of ['', ...editions.map((edition) => `editions/${edition}/`)])
    for (const [directory, source] of [
      ['definitions', 'bsdata'],
      ['datacards', 'game-datacards'],
    ] as const)
      if (fs.existsSync(path.join(root, prefix, directory))) visit(`${prefix}${directory}`, source)
  return found
}

/**
 * Where every file a token can name lives upstream, by file id, so a token built by another
 * process — the offline download's — still finds its file.
 */
export function textSourceFiles(root: string, composition: CatalogueComposition | null) {
  return textFilesFrom(textSourcePaths(root, composition))
}

export const textFilesFrom = (paths: readonly TextSourceFile[]): Record<string, TextSourceFile> =>
  Object.fromEntries(paths.map(({ url, source }) => [textFileId(url), { url, source }]))

/** The ids a source file gives its records, read once per file: what lets a pointer name a record an agent can find there. */
export function recordIdsIn(file: string) {
  const ids = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) for (const entry of value) visit(entry)
    else if (value && typeof value === 'object')
      for (const [key, entry] of Object.entries(value)) {
        if (key === 'id' && typeof entry === 'string') ids.add(entry)
        else visit(entry)
      }
  }
  visit(JSON.parse(fs.readFileSync(file, 'utf8')))
  return ids
}

const TOKENS_AND_WORDS = /(\u27E6[^\u27E7]*\u27E7)/
const TEXT_PROFILE_KINDS = new Set(['rule', 'other', 'transport'])

/**
 * A published value with every BSData rules text in its descriptions and rule-like profiles swapped for its token.
 *
 * A description is a definitions file's text as written, or Game Datacards tokens with such
 * text between them, or paragraphs of either; each piece the files state is swapped whole.
 */
export function withDefinitionTokens<T>(value: T, token: ((raw: string) => string | null) | undefined): T {
  if (!token) return value
  const published = (text: string) =>
    token(text) ??
    text
      .split(TOKENS_AND_WORDS)
      .map((piece) =>
        TOKENS_AND_WORDS.test(piece)
          ? piece
          : piece
              .split('\n\n')
              .map((paragraph) => token(paragraph) ?? paragraph)
              .join('\n\n'),
      )
      .join('')
  // A rule-like profile's characteristics are its rules text, where a unit or weapon profile's are numbers and keywords.
  const visit = (item: unknown, key?: string, ruleProfile = false): unknown => {
    if (typeof item === 'string') return key === 'description' || (ruleProfile && key === 'value') ? published(item) : item
    if (Array.isArray(item)) return item.map((entry) => visit(entry, undefined, ruleProfile))
    if (item && typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype) {
      const record = item as Record<string, unknown>
      const rules = Array.isArray(record.values) && TEXT_PROFILE_KINDS.has(String(record.kind))
      return Object.fromEntries(
        Object.entries(record).map(([field, entry]) => [field, visit(entry, field, ruleProfile || (rules && field === 'values'))]),
      )
    }
    return item
  }
  return visit(value) as T
}
