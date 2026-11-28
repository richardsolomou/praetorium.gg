import { pickerSteps } from '../shared/pickerUnits'
import { app } from './app'
import { completeStepsCooperatively } from './canonicalCatalogue'
import { pickersOpened } from './recentPickers'
import { reportServerFailure } from './serverTelemetry'

type PickerRequest = {
  catalogueId: string
  battleSize?: number
  waivedRules?: readonly string[]
  detachmentIds?: readonly string[]
}

/**
 * Builds one roster's picker between other requests. Each new battle size, detachment or waived rule prices every
 * datasheet the book offers, which otherwise holds the server's only thread for seconds.
 */
export async function preparePicker({ catalogueId, battleSize, waivedRules, detachmentIds }: PickerRequest) {
  const instance = app()
  const loaded = await instance.catalogueFor(catalogueId)
  if (!loaded) return null
  const rules = await instance.rulesFor(catalogueId)
  await completeStepsCooperatively(pickerSteps(loaded, catalogueId, battleSize, waivedRules, detachmentIds))
  return { loaded, rules }
}

/**
 * Builds the pickers rosters opened most recently, one after another between other requests, since every start and
 * catalogue swap begins with none built. Stops once `current` says a newer catalogue replaced the one it builds for.
 */
export async function prepareRecentPickers(current: () => boolean) {
  for (const picker of [...pickersOpened().list()]) {
    if (!current()) return
    try {
      await preparePicker(picker)
    } catch (error) {
      reportServerFailure({ event: 'recent_picker_build_failed', error }, 'warn')
    }
  }
}
