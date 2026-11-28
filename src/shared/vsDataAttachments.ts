import type { AttachmentCondition, AttachmentJoin, VsAttachment } from '../core/attach'
import type { PrintedTransport } from '../core/transport'
import { vsTransport } from '../core/transport'
import type { AttachmentData, ConditionalAttachment, VsDataDefinitions } from '../core/vsDataConstruction'
import { idsIn, type VsDataIds } from './vsDataPoints'

const ROLE = { leads: 'leader', supports: 'support' } as const

/**
 * Joiners whose VS Data hosts are known wrong or still unsettled, which keep the catalogue's hosts VS Data does not name:
 * the Regimental Attachés' join and the Crisis Commander's misprinted host until richardsolomou/vs-data#228 releases,
 * the Deathwatch leaders until richardsolomou/vs-data#ISSUE settles their hosts, and the Crucible Node and Prime
 * Organisms' Raveners, which only the catalogue gives, until richardsolomou/vs-data#ISSUE settles them.
 */
const CATALOGUE_HOSTS = new Set([
  'astra-militarum.regimental-attaches',
  'tau-empire.commander-in-crisis-battlesuit',
  'imperial-agents.watch-master',
  'imperial-agents.watch-captain-artemis',
  'imperial-agents.inquisitor-eisenhorn',
  'imperial-agents.inquisitor-in-terminator-armour',
  'tyranids.node-organism',
  'tyranids.prime-organism',
])

/**
 * Who each datasheet may join in one rules version, from VS Data's attachment records, by the BSData entry IDs saved
 * lists hold. A host is named as every catalogue datasheet of its VS Data unit is, and a unit none stands for is left
 * out; a condition's Detachments and units become the catalogue's IDs a list holds. A record VS Data could not type a
 * target or capacity of keeps what it could.
 */
export function vsAttachmentsIndex(
  definitions: VsDataDefinitions,
  ids: Pick<VsDataIds, 'units' | 'detachments'>,
  edition: string | null,
  nameOf: (entryId: string) => string | undefined,
): Record<string, VsAttachment> {
  const units = datasheetUnits(ids.units, edition)
  const entriesOf = reverse(units)
  const detachmentsOf = reverse(idsIn(ids.detachments, edition))
  // A unit no catalogue datasheet stands for, as the sodalities VS Data splits by spear, is no host a list can field yet.
  const namesOf = (unit: string) => [...new Set((entriesOf.get(unit) ?? []).flatMap((entryId) => nameOf(entryId) ?? []))]
  // A unit holds its models' keywords too, as Chaplain Grimaldus and the Command Squads are CHARACTERs only by a model's.
  const keywordsOf = (unit: string) =>
    [
      ...(definitions.get('unit', unit)?.data.keywords ?? []),
      ...definitions.modelsOf(unit).flatMap((model) => model.data.keywords ?? []),
    ].map((keyword) => keyword.toUpperCase())
  const resolved = new Map<string, VsAttachment | null>()
  const standIns = standInsOf(definitions)
  // Read only for a condition that takes hosts by keyword, as most rules versions' lists never need it.
  let unitKeywords: { id: string; keywords: string[] }[] | undefined
  const holdingKeywords = (keywords: readonly string[], excluded: readonly string[] = []) =>
    (unitKeywords ??= definitions.all('unit').map(({ id }) => ({ id, keywords: keywordsOf(id) })))
      .filter(
        (unit) =>
          keywords.every((keyword) => unit.keywords.includes(keyword.toUpperCase())) &&
          !excluded.some((keyword) => unit.keywords.includes(keyword.toUpperCase())),
      )
      .map((unit) => unit.id)
  const attachmentOf = (data: AttachmentData): VsAttachment | null => {
    const capacity = data.capacity && {
      ...(data.capacity.leads ? { leader: data.capacity.leads } : {}),
      ...(data.capacity.supports ? { support: data.capacity.supports } : {}),
      ...(data.capacity.startingStrength ? { startingStrength: data.capacity.startingStrength } : {}),
      ...(data.capacity.distinct ? { distinct: true as const } : {}),
      ...(data.capacity.limits?.length ? { limits: data.capacity.limits.map(({ keywords, max }) => ({ keywords, maximum: max })) } : {}),
    }
    const host = capacity ? { capacity } : {}
    if (data.joins?.length) {
      const joins = data.joins.map((join): AttachmentJoin => {
        const targets = (join.units ?? []).flatMap(namesOf)
        return {
          ...(targets.length ? { targets } : {}),
          ...(join.keywords?.length ? { keywords: join.keywords } : {}),
          ...(!join.units && !join.keywords ? { anyHost: true as const } : {}),
          ...(join.ledBy?.length ? { ledBy: join.ledBy } : {}),
          ...(join.exclusive?.length ? { exclusive: join.exclusive } : {}),
        }
      })
      return { targets: [], named: [...new Set(joins.flatMap((join) => join.targets ?? []))], joins, ...host }
    }
    // An attachment takes one role in an army, so a record that leads some units and supports others stays the catalogue's.
    if (data.leads?.length && data.supports?.length) return capacity ? { targets: [], named: [], ...host } : null
    const role = data.leads?.length ? 'leads' : data.supports?.length ? 'supports' : undefined
    const keywords = keywordsOf(data.unit)
    // A bodyguard that stands in for one of its hosts, as "it can be attached to this unit instead" says, takes it too.
    const instead = (named: readonly string[], entryRole: 'leads' | 'supports') =>
      standingIn(named, entryRole, keywords, standIns).filter((unit) => unit !== data.unit)
    const hosts = role ? [...data[role]!, ...instead(data[role]!, role)] : []
    const targets = [...new Set(hosts.flatMap(namesOf))]
    // A condition no list can meet here is left out, and its hosts with it, so the catalogue's reading of them stands.
    const conditional = (data.conditional ?? []).flatMap((entry) => {
      // A host taken by its keywords is named too, as the catalogue may not give it those keywords, and brings the
      // bodyguards that stand in for it, as named hosts do.
      const holders = entry.keywords ? holdingKeywords(entry.keywords, entry.excludedKeywords).filter((unit) => unit !== data.unit) : []
      const stoodIn = [...(entry.units ?? []), ...holders]
      const entryHosts = [...stoodIn, ...instead(stoodIn, entry.role)]
      const read = condition({ ...entry, ...(entryHosts.length ? { units: entryHosts } : {}) }, namesOf, entriesOf, detachmentsOf)
      return read.requires?.some((group) => !group.length) ? [] : [read]
    })
    const besideAnother = (data.withAnotherLeader ?? []).map((entry) => {
      const besideNames = (entry.besideUnits ?? []).flatMap(namesOf)
      return {
        targets: [...new Set([...entry.units, ...instead(entry.units, 'leads')].flatMap(namesOf))],
        ...(besideNames.length ? { besideNames } : {}),
        ...(entry.besideKeywords?.length ? { besideKeywords: entry.besideKeywords } : {}),
      }
    })
    if (!targets.length && !conditional.length) return capacity ? { targets: [], named: [], ...host } : null
    const named = [...targets, ...conditional.flatMap((entry) => entry.targets ?? [])]
    return {
      ...(role ? { kind: ROLE[role] } : {}),
      targets,
      ...(conditional.length ? { conditional } : {}),
      named: [...new Set(named)],
      ...(besideAnother.length ? { besideAnother } : {}),
      ...host,
    }
  }
  const attachments: Record<string, VsAttachment> = {}
  for (const [entryId, unit] of units) {
    // A copied or Legends datasheet's attachment record publishes before its roster definition, which may not exist yet.
    const record = !definitions.unavailable.has(unit) && definitions.get('attachment', unit)
    if (!record) continue
    if (!resolved.has(unit)) resolved.set(unit, attachmentOf(record.data))
    const found = resolved.get(unit)
    // A joiner VS Data has no roster definition of yet, as a copied Crucible datasheet, keeps the catalogue's hosts too.
    const settled = !CATALOGUE_HOSTS.has(unit) && definitions.get('unit', unit)
    if (found) attachments[entryId] = settled ? found : { ...found, catalogueHosts: true }
  }
  return attachments
}

/** The names of the datasheets VS Data defines a unit for in one rules version, which it alone decides as hosts of its joiners. */
export function vsAttachmentHosts(
  definitions: VsDataDefinitions,
  units: Readonly<Record<string, string>>,
  edition: string | null,
  nameOf: (entryId: string) => string | undefined,
): string[] {
  const names = [...datasheetUnits(units, edition)].flatMap(([entryId, unit]) =>
    fielded(definitions, unit) ? (nameOf(entryId) ?? []) : [],
  )
  return [...new Set(names)].sort()
}

/** What each transport carries in one rules version, from VS Data's records; one whose capacity has no printed shape stays with its printed rule. */
export function vsTransportsIndex(
  definitions: VsDataDefinitions,
  units: Readonly<Record<string, string>>,
  edition: string | null,
): Record<string, PrintedTransport> {
  const transports: Record<string, PrintedTransport> = {}
  for (const [entryId, unit] of datasheetUnits(units, edition)) {
    const capacity = fielded(definitions, unit) && definitions.get('transport-profile', unit)?.data.capacity
    const transport = capacity && vsTransport(capacity)
    if (transport) transports[entryId] = transport
  }
  return transports
}

/** Each datasheet's VS Data unit; its readers look a datasheet up without a book, so a book key (`<book>/<ID>`) has none. */
const datasheetUnits = (units: Readonly<Record<string, string>>, edition: string | null) =>
  new Map([...idsIn(units, edition)].filter(([key]) => !key.includes('/')))

const fielded = (definitions: VsDataDefinitions, unit: string) =>
  !definitions.unavailable.has(unit) && Boolean(definitions.get('unit', unit))

function condition(
  { role, units, keywords, excludedKeywords, when = {}, shared }: ConditionalAttachment,
  namesOf: (unit: string) => string[],
  entriesOf: ReadonlyMap<string, string[]>,
  detachmentsOf: ReadonlyMap<string, string[]>,
): AttachmentCondition {
  // A condition on something no list can hold, such as a faction, which no army's ids name, reads as an empty group.
  const requires = [
    ...(when.detachment ? [detachmentsOf.get(when.detachment) ?? []] : []),
    ...(when.withUnit ? [entriesOf.get(when.withUnit) ?? []] : []),
    ...(when.faction ? [[]] : []),
  ]
  const excludes = [
    ...(when.withoutDetachment ? (detachmentsOf.get(when.withoutDetachment) ?? []) : []),
    ...(when.withoutUnit ? (entriesOf.get(when.withoutUnit) ?? []) : []),
  ]
  const targets = (units ?? []).flatMap(namesOf)
  return {
    kind: ROLE[role],
    ...(targets.length ? { targets } : {}),
    ...(keywords?.length ? { keywords } : {}),
    ...(excludedKeywords?.length ? { excludedKeywords } : {}),
    ...(requires.length ? { requires } : {}),
    ...(excludes.length ? { excludes } : {}),
    ...(shared ? { shared } : {}),
  }
}

type StandIn = { unit: string; role?: 'leads' | 'supports'; keywords?: string[]; excludedKeywords?: string[] }

/** Each unit's stand-ins: the bodyguards whose `insteadOf` names it, with the role and keywords they take a joiner in. */
function standInsOf(definitions: VsDataDefinitions) {
  const found = new Map<string, StandIn[]>()
  for (const { data } of definitions.all('attachment'))
    for (const { units, ...entry } of data.insteadOf ?? [])
      for (const unit of units) found.set(unit, [...(found.get(unit) ?? []), { unit: data.unit, ...entry }])
  return found
}

/** The bodyguards that stand in for any of `units`, and for those in turn, for a joiner in `role` holding `keywords`. */
function standingIn(
  units: readonly string[],
  role: 'leads' | 'supports',
  keywords: readonly string[],
  standIns: ReadonlyMap<string, StandIn[]>,
) {
  const found = new Set<string>()
  const visit = (unit: string) => {
    for (const standIn of standIns.get(unit) ?? []) {
      if (found.has(standIn.unit) || (standIn.role && standIn.role !== role)) continue
      if (!(standIn.keywords ?? []).every((keyword) => keywords.includes(keyword.toUpperCase()))) continue
      if ((standIn.excludedKeywords ?? []).some((keyword) => keywords.includes(keyword.toUpperCase()))) continue
      found.add(standIn.unit)
      visit(standIn.unit)
    }
  }
  for (const unit of units) visit(unit)
  return [...found]
}

function reverse(map: ReadonlyMap<string, string>) {
  const found = new Map<string, string[]>()
  for (const [key, id] of map) found.set(id, [...(found.get(id) ?? []), key])
  return found
}
