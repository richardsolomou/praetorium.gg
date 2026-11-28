/**
 * Report-only: who each datasheet may lead or support, and what each transport admits, as the catalogue alone reads it
 * against the reading with VS Data's `attachment` and `transport-profile` records laid over it, per book of the current
 * rules version or the one named. A pair is lost when no army allows it any more, added when the catalogue alone never allowed it, and
 * conditional when only some armies allow it now. A transport's verdict on each datasheet of its book is whether one
 * model may embark and whether the datasheet's default size fits. Writes `data-dev/vs-data-attachment-parity[-<rules version>].json` with
 * datasheet names, and prints counts.
 *
 *   pnpm exec tsx scripts/vsDataAttachmentParity.ts [catalogue directory] [rules version]
 */
import fs from 'node:fs'
import path from 'node:path'
import { admitsHost, attachmentOf, attachmentPartyOf, attachmentRoles, inArmy } from '../src/core/attach'
import { type CatalogueIndex, nameOf } from '../src/core/catalogue'
import { defaultSelection } from '../src/core/expand'
import { nonMatchedPlayKind } from '../src/core/name'
import { type PrintedTransport, transportLoad, transportRule } from '../src/core/transport'
import { modelCountOf } from '../src/core/unitSize'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { datasheetIn, keywordsIn, woundsOf } from '../src/shared/catalogue'
import { datasheetsOf } from '../src/shared/catalogueIndex'

const directory = path.resolve(process.argv[2] ?? 'catalogue-data')
const version = process.argv[3]
const entry = version ? readCatalogueComposition(directory)?.editions.find((candidate) => candidate.edition.id === version) : undefined
if (version && !entry) throw new Error(`${directory} has no rules version ${version}`)
const loaded = entry
  ? loadCatalogue(editionDirectory(directory, entry), entry.edition, { snapshotDirectory: directory })
  : loadCatalogue(directory)
if (!loaded?.index.attachments) throw new Error(`${directory} has no VS Data attachments for ${version ?? 'the current rules version'}`)
const index = loaded.index
const catalogueOnly: CatalogueIndex = { ...index, attachments: undefined }
const printedOnly = { ...loaded, vsProfiles: { ...loaded.vsProfiles, transports: {} } }
const kind = (name: string) => nonMatchedPlayKind(name) ?? 'matched'

type Pairs = { lost: string[]; added: string[]; conditional: string[]; roleChanged: string[] }
const attachments: Record<string, Pairs> = {}
const pairCounts: Record<string, { same: number; lost: number; added: number; conditional: number; roleChanged: number }> = {}
/** Units that join any unit a leader of theirs leads, which no list of hosts can say; and bodyguards whose limits changed. */
const joinsAnyLed: string[] = []
const limits: Record<string, { before: unknown; after: unknown }> = {}
type Verdicts = { admits: string[]; refuses: string[]; fits: string[]; overflows: string[] }
const transports: Record<string, { from: 'vs-data' | 'printed'; changed: Verdicts; nowRead?: true }> = {}
const transportCounts = { transports: 0, fromVsData: 0, verdicts: 0, admitChanged: 0, fitChanged: 0, nowRead: 0 }
const printedTransports = new Set<string>()

for (const catalogue of index.catalogues.values()) {
  const own = datasheetsOf(index, catalogue.id)
  const sheets = [...own, ...(index.alliedDatasheets.get(catalogue.id)?.keys() ?? [])]
  const units = sheets.map((id) => {
    const selection = defaultSelection(id, index, { primaryCatalogueId: catalogue.id })
    const sheet = datasheetIn(loaded, catalogue.id, id)
    return {
      id,
      name: nameOf(index.definitions.get(id)!, index.definitions),
      keywords: keywordsIn(loaded, catalogue.id, id),
      selection: selection ?? { id },
      models: selection ? modelCountOf(selection, index) : 1,
      wounds: sheet ? (woundsOf(sheet.profiles) ?? undefined) : undefined,
      sheet,
    }
  })
  // Entries sharing a name in one book, as a codex and its allied copy, count once.
  const counted = new Set<string>()
  for (const joiner of units) {
    const key = `${catalogue.name} / ${joiner.name}`
    if (!own.has(joiner.id) || counted.has(key)) continue
    counted.add(key)
    const definition = index.definitions.get(joiner.id)!
    const before = attachmentOf(definition, catalogueOnly, joiner.selection)
    const after = attachmentOf(definition, index, joiner.selection)
    if (!before && !after) continue
    if (after?.joins?.some((join) => join.anyHost)) {
      joinsAnyLed.push(`${key} (led by ${after.joins.map((join) => join.ledBy?.join(' ')).join(' or ')})`)
      continue
    }
    // An army holding nothing, where no condition on a Detachment or unit it must include holds, and one holding every
    // Detachment and unit a condition names, where none it must not include does.
    const conditions = after?.conditional ?? []
    const named = new Set(conditions.flatMap((entry) => [...(entry.requires ?? []).flat(), ...(entry.excludes ?? [])]))
    const settled = [inArmy(after, new Set(), joiner.keywords), inArmy(after, named, joiner.keywords)]
    const roles = (attachment: NonNullable<typeof after>) => [
      ...new Set([...attachmentRoles(attachment), ...(attachment.conditional ?? []).map((entry) => entry.kind)]),
    ]
    // Each host the unit may join, with the roles it takes there: a join counts as joining, whatever its role.
    const pairs = (attachment: typeof before) =>
      new Map(
        units.flatMap((host) =>
          host.id !== joiner.id && attachment && admitsHost(attachment, host.name, host.keywords)
            ? [
                [
                  host.name,
                  attachment.joins
                    ? 'joins'
                    : roles(attachment)
                        .map((role) => (role === 'leader' ? 'leads' : 'supports'))
                        .join('/'),
                ] as const,
              ]
            : [],
        ),
      )
    const was = pairs(before)
    const now = pairs(after)
    const [empty, full] = settled.map(pairs)
    const held = new Set([...empty!.keys()].filter((host) => full!.has(host)))
    const found: Pairs = {
      lost: [...was.keys()].filter((host) => !now.has(host)).map((host) => `${was.get(host)} ${host}`),
      added: [...now.keys()].filter((host) => !was.has(host)).map((host) => `${now.get(host)} ${host}`),
      conditional: [...was.keys()].filter((host) => now.has(host) && !held.has(host)).map((host) => `${now.get(host)} ${host}`),
      roleChanged: [...was.keys()]
        .filter((host) => now.has(host) && was.get(host) !== now.get(host))
        .map((host) => `${host}: ${was.get(host)} → ${now.get(host)}`),
    }
    const counts = (pairCounts[kind(joiner.name)] ??= { same: 0, lost: 0, added: 0, conditional: 0, roleChanged: 0 })
    counts.same += [...was.keys()].filter((host) => now.has(host) && held.has(host)).length
    counts.lost += found.lost.length
    counts.added += found.added.length
    counts.conditional += found.conditional.length
    counts.roleChanged += found.roleChanged.length
    if (Object.values(found).some((list) => list.length)) attachments[key] = found
  }
  for (const host of units) {
    const key = `${catalogue.name} / ${host.name}`
    if (!own.has(host.id) || limits[key]) continue
    const definition = index.definitions.get(host.id)!
    const before = attachmentPartyOf(definition, catalogueOnly, host.selection).attachmentLimits
    const after = attachmentPartyOf(definition, index, host.selection).attachmentLimits
    if (JSON.stringify(before) !== JSON.stringify(after)) limits[key] = { before, after }
  }
  for (const transport of units) {
    const key = `${catalogue.name} / ${transport.name}`
    const printed = datasheetIn(printedOnly, catalogue.id, transport.id)
    const was = printed?.transportCapacity ?? printed?.transport ?? undefined
    const now = transport.sheet?.transportCapacity ?? transport.sheet?.transport ?? undefined
    if ((!was && !now) || transports[key]) continue
    transportCounts.transports++
    const fromVsData = loaded.vsProfiles?.transports?.[transport.id] !== undefined
    if (fromVsData) transportCounts.fromVsData++
    else printedTransports.add(transport.name)
    const changed: Verdicts = { admits: [], refuses: [], fits: [], overflows: [] }
    const verdict = (capacity: string | PrintedTransport | undefined, passenger: (typeof units)[number], alive: number) => {
      const rule = transportRule(capacity)
      if (!rule) return 'unread'
      const load = transportLoad(rule, [{ name: passenger.name, alive, keywords: passenger.keywords, wounds: passenger.wounds }])
      return 'code' in load ? load.code : 'fits'
    }
    for (const passenger of units) {
      if (passenger.id === transport.id) continue
      transportCounts.verdicts++
      const one = [verdict(was, passenger, 1), verdict(now, passenger, 1)]
      const all = [verdict(was, passenger, passenger.models), verdict(now, passenger, passenger.models)]
      // A rule the printed text could not be read into refused every passenger; reading one is not a change of verdict.
      if (one[0] === 'unread' && one[1] !== 'unread') transportCounts.nowRead++
      else if (one[0] !== one[1]) {
        transportCounts.admitChanged++
        changed[one[1] === 'fits' ? 'admits' : 'refuses'].push(`${passenger.name} (${one[0]} → ${one[1]})`)
      } else if (all[0] !== all[1] && all[0] !== 'unread') {
        transportCounts.fitChanged++
        changed[all[1] === 'fits' ? 'fits' : 'overflows'].push(`${passenger.name} ×${passenger.models} (${all[0]} → ${all[1]})`)
      }
    }
    if (Object.values(changed).some((list) => list.length)) transports[key] = { from: fromVsData ? 'vs-data' : 'printed', changed }
    else if (fromVsData && !printed?.transportCapacity) transports[key] = { from: 'vs-data', changed, nowRead: true }
  }
}
fs.mkdirSync('data-dev', { recursive: true })
fs.writeFileSync(
  `data-dev/vs-data-attachment-parity${version ? `-${version}` : ''}.json`,
  `${JSON.stringify({ pairCounts, transportCounts, printedTransports: [...printedTransports], joinsAnyLed, limits, attachments, transports }, null, 2)}\n`,
)
console.log(
  JSON.stringify({
    pairCounts,
    transportCounts,
    printedTransports: [...printedTransports],
    joinsAnyLed: joinsAnyLed.length,
    limitChanges: Object.keys(limits).length,
  }),
)
