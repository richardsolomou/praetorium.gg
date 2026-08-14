import { attachmentOf } from '../core/attach'
import { fromBattleBaseText, type BattleBaseUnit } from '../core/battlebase'
import { nameOf } from '../core/catalogue'
import { evaluate, type Selection } from '../core/evaluate'
import { buildUnit, modelCountOf, unitChoices, unitToggles } from '../core/roster'
import { fromRosterXml, toRosterXml } from '../core/rosz'
import { isDatasheetId, type LoadedCatalogue } from './catalogueIndex'
import { parseXml, rosterXml } from './rosz'
import type { ExportRosterInput, ImportRosterInput } from './schemas'

const allSelections = (selection: Selection): Selection[] => [selection, ...(selection.selections ?? []).flatMap(allSelections)]

export function importRosterFile(data: ImportRosterInput, loaded: LoadedCatalogue) {
  const battleBase = fromBattleBaseText(data.file)
  if (battleBase) return importBattleBaseRoster(battleBase, loaded)
  const parsed = fromRosterXml(rosterXml(data.file), loaded.index, parseXml)
  const catalogueId = parsed.catalogueId && loaded.index.catalogues.has(parsed.catalogueId) ? parsed.catalogueId : null
  const detachment = catalogueId ? loaded.detachments.get(catalogueId) : undefined
  const flattened = parsed.selections.flatMap(allSelections)
  const detachmentIds =
    detachment?.options
      .flatMap((option) => {
        const at = flattened.findIndex((selection) => selection.id === option.id)
        return at < 0 ? [] : [{ id: option.id, at }]
      })
      .toSorted((left, right) => left.at - right.at)
      .map(({ id }) => id) ?? []
  const importedUnits: { selection: Selection; parent: number | null; catalogueId: string | null }[] = []
  const collectUnits = (selection: Selection, parent: number | null, forceCatalogueId: string | null) => {
    const isDatasheet = isDatasheetId(loaded.index, selection.id, forceCatalogueId)
    const at = isDatasheet ? importedUnits.push({ selection, parent, catalogueId: forceCatalogueId }) - 1 : parent
    for (const child of selection.selections ?? []) collectUnits(child, at, forceCatalogueId)
  }
  for (const force of parsed.forces) {
    for (const selection of force.selections) collectUnits(selection, null, force.catalogueId)
  }

  return {
    name: data.name ?? parsed.name,
    catalogueId,
    catalogueName: parsed.catalogueName,
    detachmentIds,
    units: importedUnits.map(({ selection, parent, catalogueId: forceCatalogueId }) => {
      const decisions = unitChoices(selection.id, selection, loaded.index, { primaryCatalogueId: catalogueId ?? undefined })
      const entry = loaded.index.definitions.get(selection.id)
      const attachedTo = parent !== null && entry && attachmentOf(entry, loaded.index) ? parent : undefined
      return {
        entryId: selection.id,
        catalogueId: forceCatalogueId ?? loaded.index.catalogueOf.get(selection.id),
        models: Math.max(1, modelCountOf(selection, loaded.index)),
        choices: Object.fromEntries(
          decisions.filter((choice) => choice.room === 1 && choice.chosen).map((choice) => [choice.key, choice.chosen]),
        ),
        spreads: Object.fromEntries(
          decisions
            .filter((choice) => choice.room > 1)
            .map((choice) => [choice.key, Object.fromEntries(choice.options.map((option) => [option.id, option.count]))]),
        ),
        toggles: Object.fromEntries(
          unitToggles(selection.id, selection, loaded.index).map((toggle) => [toggle.key, toggle.selected ? 1 : 0]),
        ),
        attachedTo,
      }
    }),
    unknown: parsed.unknown,
  }
}

const normalized = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[’‘]/g, "'")
const slug = (value: string) =>
  normalized(value)
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function importBattleBaseRoster(parsed: NonNullable<ReturnType<typeof fromBattleBaseText>>, loaded: LoadedCatalogue) {
  const faction = loaded.factions.find((candidate) => {
    const names = [candidate.name, candidate.name.split(' - ').at(-1) ?? '']
    return names.some((name) => normalized(name) === normalized(parsed.faction))
  })
  if (!faction) {
    return { name: parsed.name, catalogueId: null, catalogueName: parsed.faction, detachmentIds: [], units: [], unknown: [parsed.faction] }
  }

  const detachmentName = parsed.detachment
  const detachment = detachmentName
    ? loaded.detachments.get(faction.id)?.options.find((candidate) => normalized(candidate.name) === normalized(detachmentName))
    : undefined
  const unknown = detachment || !detachmentName ? [] : [detachmentName]
  const sourceToImported = new Map<number, number>()
  const units = parsed.units.flatMap((unit, sourceIndex) => {
    const entryId = [...(loaded.index.datasheets.get(faction.id) ?? [])].find((candidate) => {
      const definition = loaded.index.definitions.get(candidate)
      return definition && normalized(nameOf(definition, loaded.index.definitions)) === normalized(unit.name)
    })
    if (!entryId) {
      unknown.push(unit.name)
      return []
    }
    sourceToImported.set(sourceIndex, sourceToImported.size)
    return [battleBasePick(unit, entryId, faction.id, loaded)]
  })

  parsed.units.forEach((unit, sourceIndex) => {
    const leading = unit.leading
    const importedAt = sourceToImported.get(sourceIndex)
    if (!leading || importedAt === undefined || !units[importedAt]) return
    const targetSource = parsed.units.findIndex((candidate) => normalized(candidate.name) === normalized(leading))
    const target = sourceToImported.get(targetSource)
    if (target !== undefined && units[target]) units[importedAt] = { ...units[importedAt], attachedTo: target }
  })

  return {
    name: parsed.name,
    catalogueId: faction.id,
    catalogueName: faction.name,
    detachmentIds: detachment ? [detachment.id] : [],
    disposition: parsed.disposition ? slug(parsed.disposition) : null,
    limit: parsed.limit,
    units,
    unknown,
  }
}

function battleBasePick(unit: BattleBaseUnit, entryId: string, catalogueId: string, loaded: LoadedCatalogue) {
  const stated = new Map(unit.selections.map((selection) => [normalized(selection.name), selection.count]))
  const requestedModels = Math.max(1, ...unit.selections.map((selection) => selection.count))
  const built = buildUnit(entryId, loaded.index, requestedModels, {}, { primaryCatalogueId: catalogueId })
  const selection = built?.selection ?? { id: entryId, count: 1 }
  const choices = unitChoices(entryId, selection, loaded.index, { primaryCatalogueId: catalogueId })
  const toggles = Object.fromEntries(unitToggles(entryId, selection, loaded.index).map((toggle) => [toggle.key, unit.warlord ? 1 : 0]))
  return {
    entryId,
    catalogueId,
    models: built?.size.models ?? 1,
    choices: Object.fromEntries(
      choices
        .filter((choice) => choice.room === 1)
        .map((choice) => [choice.key, choice.options.find((option) => stated.has(normalized(option.name)))?.id ?? choice.chosen])
        .filter(([, chosen]) => Boolean(chosen)),
    ),
    spreads: Object.fromEntries(
      choices
        .filter((choice) => choice.room > 1)
        .map((choice) => [
          choice.key,
          Object.fromEntries(choice.options.map((option) => [option.id, stated.get(normalized(option.name)) ?? option.count])),
        ]),
    ),
    toggles,
    attachedTo: undefined as number | undefined,
  }
}

export function exportRosterFile(data: ExportRosterInput, loaded: LoadedCatalogue) {
  const built = data.units.map((wanted) => {
    const result = buildUnit(wanted.entryId, loaded.index, wanted.models, wanted.choices, {
      primaryCatalogueId: data.catalogueId,
      spreads: wanted.spreads,
      toggles: wanted.toggles,
    })
    return result?.selection ?? null
  })
  const selections = built.filter((selection): selection is Selection => selection !== null)
  const detachmentSelection = data.detachmentIds.map((id): Selection => ({ id, count: 1 }))
  const points = evaluate([...detachmentSelection, ...selections], loaded.index, { primaryCatalogueId: data.catalogueId }).points
  const exported: Selection[] = []
  for (const selection of selections) exported.push({ ...selection, selections: [...(selection.selections ?? [])] })
  data.units.forEach((unit, index) => {
    if (unit.attachedTo === undefined || unit.attachedTo === index) return
    const child = exported[index]
    const parent = exported[unit.attachedTo]
    if (!child || !parent) return
    parent.selections = [...(parent.selections ?? []), child]
  })
  const nested = exported.filter((_, index) => !data.units.some((unit, child) => child === index && unit.attachedTo !== undefined))
  const forceSelections = new Map<string, Selection[]>([[data.catalogueId, [...detachmentSelection]]])
  nested.forEach((selection) => {
    const unit = data.units[exported.indexOf(selection)]
    const owner = unit?.catalogueId ?? loaded.index.catalogueOf.get(selection.id) ?? data.catalogueId
    const force = forceSelections.get(owner) ?? []
    force.push(selection)
    forceSelections.set(owner, force)
  })
  const forces = [...forceSelections].map(([catalogueId, force]) => ({ catalogueId, selections: force }))

  return {
    filename: `${data.name.replaceAll(/[^\w -]/g, '')}.ros`,
    xml: toRosterXml(
      { name: data.name, catalogueId: data.catalogueId, selections: forces[0]?.selections ?? [], forces },
      loaded.index,
      points,
    ),
  }
}
