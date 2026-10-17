import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { type CatalogueComposition, readCatalogueComposition } from './catalogueComposition'
import { type CatalogueSourceConfig, catalogueSources } from './catalogueSources'
import { type SourceTexts, TEXT_HASH_LENGTH, textToken } from '../shared/sourceText'

export type { SourceTexts }

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/**
 * A token names a file by a hash of where it lives upstream: rules versions copy most files
 * unchanged, and one upstream file must give one token wherever a snapshot holds a copy.
 */
export const textFileId = (upstream: string) => sha256(upstream).slice(0, 8)

/** Tokens for the strings of one file, named by its upstream address, or by its snapshot path where it has none. */
export function sourceTexts(upstream: string): SourceTexts {
  const file = textFileId(upstream)
  return (raw, transform) => textToken({ file, transform, hash: sha256(raw).slice(0, TEXT_HASH_LENGTH) })
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
  let resolve = roots.get(root)
  if (!resolve) {
    const composition = fs.existsSync(path.join(root, 'composition.json')) ? readCatalogueComposition(root) : null
    const retained = retainedSnapshots(root)
    const answered = new Map<string, string | null>()
    resolve = (file) => {
      if (!answered.has(file)) answered.set(file, upstreamUrl(file, composition, retained))
      return answered.get(file)!
    }
    roots.set(root, resolve)
  }
  return resolve
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
export type RetainedSnapshot = { composition: CatalogueComposition | null; revisions: Readonly<Record<string, string>> }

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

/**
 * Where every file a token can name lives upstream, by file id: each JSON file of the
 * three text sources the snapshot holds, at the root and in every rules version, so a
 * token built by another process — the offline download's — still finds its file.
 */
export function textSourceFiles(root: string, composition: CatalogueComposition | null): Record<string, string> {
  const files: Record<string, string> = {}
  const retained = retainedSnapshots(root)
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.json')) {
        const url = upstreamUrl(file, composition, retained)
        if (url) files[textFileId(url)] = url
      }
    }
  }
  const editions = fs.existsSync(path.join(root, 'editions')) ? fs.readdirSync(path.join(root, 'editions')) : []
  for (const prefix of ['', ...editions.map((edition) => `editions/${edition}/`)])
    for (const source of ['definitions', 'datacards']) if (fs.existsSync(path.join(root, prefix, source))) visit(`${prefix}${source}`)
  return files
}
