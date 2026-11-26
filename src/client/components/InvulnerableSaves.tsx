import { useContext } from 'react'
import type { RuleSummary } from '../../contracts/rules'
import type { Datasheet } from '../../core/datasheet'
import { datasheetCharacteristicKind, datasheetProfileKind } from '../../core/datasheetStructure'
import type { VsDataInvulnerableSave } from '../../shared/vsData'
import { RuleSummaryText } from './RuleSummaryText'
import { SectionHeading } from './SectionHeading'
import { DatasheetUnit, invulnerableSaveScope, useVsDataUnit } from './UnitFromVsData'

/** A save as a datasheet, a builder panel and a printed pack all show it. */
export type ShownSave = { key: string; model?: string; value: string; scope?: string | null; summary?: RuleSummary }

const vsDataSaveShown = (save: VsDataInvulnerableSave): ShownSave => ({
  key: save.profile + (save.against ?? ''),
  model: save.model,
  value: `${save.roll}+`,
  scope: invulnerableSaveScope(save),
  summary: save.summary,
})

/**
 * A unit's invulnerable saves: VS Data's typed ones, with the attacks and model each is for and its condition, and the
 * catalogue's figure where VS Data has none, named by model where the datasheet has several.
 */
export function shownSaves(sheet: Pick<Datasheet, 'profiles'>, typed: readonly VsDataInvulnerableSave[] | undefined): ShownSave[] {
  const models = sheet.profiles.filter((profile) => datasheetProfileKind(profile.type) === 'unit')
  const saveOf = (profile: (typeof models)[number]) =>
    profile.values.find((characteristic) => datasheetCharacteristicKind(characteristic.name) === 'invulnerable-save')
  // A save the roster grants, as an enhancement does, is the catalogue's to show, as VS Data types only the datasheet's.
  if (typed?.length && !models.some((profile) => saveOf(profile)?.modifiers?.length)) return typed.map(vsDataSaveShown)
  return models.flatMap((profile) => {
    const value = saveOf(profile)?.value
    return value && value !== '-' ? [{ key: profile.id, model: models.length > 1 ? profile.name : undefined, value }] : []
  })
}

/** The saves of the datasheet inside `DatasheetUnit`, the catalogue's figure showing until VS Data's load in its place. */
export function useInvulnerableSaves(sheet: Pick<Datasheet, 'id' | 'profiles'>) {
  const [catalogueId = '', subject = ''] = useContext(DatasheetUnit)?.split('#') ?? []
  const entryId = subject && !subject.startsWith('@') ? subject : sheet.id
  return shownSaves(sheet, useVsDataUnit(catalogueId, entryId, Boolean(catalogueId))?.invulnerableSaves)
}

const LOOKS = {
  datasheet: {
    list: 'grid border-t border-edge md:grid-cols-2 md:gap-x-6',
    save: 'border-b border-edge py-2.5',
    value: 'figure text-2xl leading-none font-semibold',
  },
  panel: { list: '', save: 'border-b border-edge px-2 py-2', value: 'readout text-base' },
}

/** Each save with the model it is for, the attacks it is against and its condition, read the same wherever it shows. */
export function InvulnerableSaves({ saves, look = 'datasheet' }: { saves: readonly ShownSave[]; look?: keyof typeof LOOKS | 'print' }) {
  // A printed pack sets each save on one line at the pack's own size, as it does an ability.
  if (look === 'print')
    return (
      <div data-slot="invulnerable-saves">
        {saves.map((save) => (
          <div key={save.key} data-slot="invulnerable-save">
            <p>
              <strong>Invulnerable save{save.model ? ` (${save.model})` : ''}:</strong> {save.value}
              {save.scope ? `, ${save.scope.toLowerCase()}` : ''}
            </p>
            {save.summary ? <RuleSummaryText summary={save.summary} className="mt-0 text-[length:inherit] leading-[inherit]" /> : null}
          </div>
        ))}
      </div>
    )
  const classes = LOOKS[look]
  const table = saveTable(saves)
  const list = table ? (
    <SaveTable table={table} />
  ) : (
    <div className={classes.list}>
      {saves.map((save) => (
        <div key={save.key} data-slot="invulnerable-save" className={classes.save}>
          {/* A save with nothing to name beside it leads with its value rather than leaving it adrift at the far edge. */}
          <div className={`flex items-center gap-3 ${save.model || save.scope || look !== 'datasheet' ? 'justify-between' : ''}`}>
            <div>
              {save.model || look !== 'datasheet' ? <p className="rubric text-xs text-bone">{save.model ?? 'Invulnerable save'}</p> : null}
              {save.scope ? <p className="text-sm text-dim">{save.scope}</p> : null}
            </div>
            <span className={classes.value}>{save.value}</span>
          </div>
          {save.summary ? <RuleSummaryText summary={save.summary} className="mt-1" /> : null}
        </div>
      ))}
    </div>
  )
  if (look === 'panel') {
    // A lone save names itself in its row; a table or rows named by model need the heading to say what they are.
    if (!table && saves.every((save) => !save.model)) return list
    return (
      <section>
        <h2 className="rubric">Invulnerable saves</h2>
        <div className="mt-2">{list}</div>
      </section>
    )
  }
  return (
    <section>
      <SectionHeading title="Invulnerable save" />
      {list}
    </section>
  )
}

/** The saves of the datasheet inside `DatasheetUnit`, for a view that has no other use for VS Data's unit. */
export function DatasheetSaves({ sheet, look }: { sheet: Pick<Datasheet, 'id' | 'profiles'>; look?: keyof typeof LOOKS | 'print' }) {
  const saves = useInvulnerableSaves(sheet)
  return saves.length ? <InvulnerableSaves saves={saves} look={look} /> : null
}

/** The attacks a scope covers, as a column heading: "Against ranged attacks" reads as "Ranged". */
const scopeHeading = (scope: string | null | undefined) => {
  const rest = (scope ?? 'All attacks').replace(/^against\s+/i, '').replace(/\s+attacks?$/i, '')
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/**
 * Saves split by the attacks they cover, as a grid of models by attack, with models that save alike sharing a row; null
 * when there is nothing to cross, or a save carries a condition that needs its own words.
 */
function saveTable(saves: readonly ShownSave[]) {
  if (saves.length < 2 || !saves.some((save) => save.scope) || saves.some((save) => save.summary)) return null
  const scopes = [...new Set(saves.map((save) => scopeHeading(save.scope)))]
  const rows: { models: string[]; values: string[] }[] = []
  for (const model of new Set(saves.map((save) => save.model ?? ''))) {
    const values = scopes.map(
      (scope) => saves.find((save) => (save.model ?? '') === model && scopeHeading(save.scope) === scope)?.value ?? '—',
    )
    const same = rows.find((row) => row.values.join() === values.join())
    if (same) same.models.push(model)
    else rows.push({ models: [model], values })
  }
  return { scopes, rows }
}

/** Read like the statline table beside it, so its figures sit at the same size. */
function SaveTable({ table }: { table: NonNullable<ReturnType<typeof saveTable>> }) {
  return (
    <table className="w-full border-y border-edge text-left text-sm">
      <thead className="eyebrow border-b border-edge">
        <tr>
          <th className="px-3 py-2 font-semibold">Model</th>
          {table.scopes.map((scope) => (
            <th key={scope} className="w-24 px-3 py-2 text-right font-semibold">
              {scope}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-edge">
        {table.rows.map((row) => (
          <tr key={row.models.join()} data-slot="invulnerable-save">
            <th className="px-3 py-2.5 font-semibold text-bone">{row.models.filter(Boolean).join(', ') || 'Every model'}</th>
            {row.values.map((save, at) => (
              <td key={table.scopes[at]} className="readout px-3 py-2.5 text-right text-base text-bone">
                {save}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
