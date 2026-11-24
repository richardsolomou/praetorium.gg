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
  datasheet: { list: 'grid gap-2 md:grid-cols-2', save: 'part px-4 py-2.5', value: 'figure text-2xl leading-none font-semibold' },
  panel: { list: 'space-y-1.5', save: 'part px-2 py-1.5', value: 'readout text-base' },
  print: { list: 'pack-saves', save: '', value: 'pack-save-value' },
}

/** Each save with the model it is for, the attacks it is against and its condition, read the same wherever it shows. */
export function InvulnerableSaves({ saves, look = 'datasheet' }: { saves: readonly ShownSave[]; look?: keyof typeof LOOKS }) {
  const classes = LOOKS[look]
  const list = (
    <div className={classes.list}>
      {saves.map((save) => (
        <div key={save.key} data-slot="invulnerable-save" className={classes.save}>
          <div className="flex items-center justify-between gap-3">
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
  if (look === 'panel') return list
  return (
    <section>
      {look === 'datasheet' ? <SectionHeading title="Invulnerable save" /> : <h3>Invulnerable save</h3>}
      {list}
    </section>
  )
}
