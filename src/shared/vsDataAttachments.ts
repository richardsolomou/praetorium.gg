import type { AttachmentCondition, VsAttachment } from '../core/attach'
import type { PrintedTransport } from '../core/transport'
import { vsTransport } from '../core/transport'
import type { AttachmentData, ConditionalAttachment, VsDataDefinitions } from '../core/vsDataConstruction'
import { idsIn, type VsDataIds } from './vsDataPoints'

/** Who each datasheet may join and what each transport carries, from VS Data's records, by the BSData entry IDs saved lists hold. */
export type VsLinksIndex = {
  attachments: Record<string, VsAttachment>
  transports: Record<string, PrintedTransport>
}

const ROLE = { leads: 'leader', supports: 'support' } as const

/**
 * One rules version's attachment and transport records joined to the catalogue's datasheets. A host is named as every
 * catalogue datasheet of its VS Data unit is, and a unit none stands for is left out; a condition's Detachments and units
 * become the catalogue's IDs a list holds. A record VS Data could not type a target or capacity of keeps what it could,
 * and a transport whose capacity has no printed shape stays with the datasheet's printed rule.
 */
export function vsLinksIndex(
  definitions: VsDataDefinitions,
  ids: Pick<VsDataIds, 'units' | 'detachments'>,
  edition: string | null,
  nameOf: (entryId: string) => string | undefined,
): VsLinksIndex {
  // Its readers look a datasheet up without a book, so a book key (`<book>/<ID>`) has no place here.
  const units = new Map([...idsIn(ids.units, edition)].filter(([key]) => !key.includes('/')))
  const entriesOf = reverse(units)
  const detachmentsOf = reverse(idsIn(ids.detachments, edition))
  // A unit no catalogue datasheet stands for, as the sodalities VS Data splits by spear, is no host a list can field yet.
  const namesOf = (unit: string) => [...new Set((entriesOf.get(unit) ?? []).flatMap((entryId) => nameOf(entryId) ?? []))]
  const resolved = new Map<string, VsAttachment | null>()
  const attachmentOf = (data: AttachmentData): VsAttachment | null => {
    // An attachment takes one role in an army, so a record that leads some units and supports others stays the catalogue's.
    if (data.leads?.length && data.supports?.length) return null
    const role = data.leads?.length ? 'leads' : data.supports?.length ? 'supports' : undefined
    const targets = role ? data[role]!.flatMap(namesOf) : []
    // A condition no list can meet here is left out, and its hosts with it, so the catalogue's reading of them stands.
    const conditional = (data.conditional ?? []).flatMap((entry) => {
      const read = condition(entry, namesOf, entriesOf, detachmentsOf)
      return read.requires?.some((group) => !group.length) ? [] : [read]
    })
    if (!targets.length && !conditional.length) return null
    const named = [...targets, ...conditional.flatMap((entry) => entry.targets ?? [])]
    return {
      ...(role ? { kind: ROLE[role] } : {}),
      targets,
      ...(conditional.length ? { conditional } : {}),
      named: [...new Set(named)],
    }
  }
  const attachments: VsLinksIndex['attachments'] = {}
  const transports: VsLinksIndex['transports'] = {}
  for (const [entryId, unit] of units) {
    if (definitions.unavailable.has(unit) || !definitions.get('unit', unit)) continue
    const record = definitions.get('attachment', unit)
    if (record) {
      if (!resolved.has(unit)) resolved.set(unit, attachmentOf(record.data))
      const found = resolved.get(unit)
      if (found) attachments[entryId] = found
    }
    const capacity = definitions.get('transport-profile', unit)?.data.capacity
    const transport = capacity && vsTransport(capacity)
    if (transport) transports[entryId] = transport
  }
  return { attachments, transports }
}

function condition(
  { role, units, keywords, when = {}, shared }: ConditionalAttachment,
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
    ...(requires.length ? { requires } : {}),
    ...(excludes.length ? { excludes } : {}),
    ...(shared ? { shared } : {}),
  }
}

function reverse(map: ReadonlyMap<string, string>) {
  const found = new Map<string, string[]>()
  for (const [key, id] of map) found.set(id, [...(found.get(id) ?? []), key])
  return found
}
