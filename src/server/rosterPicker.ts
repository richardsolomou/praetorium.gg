import { pickerSteps } from '../shared/pickerUnits'
import { app } from './app'
import { completeStepsCooperatively } from './canonicalCatalogue'

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
  await completeStepsCooperatively(pickerSteps(loaded, rules, catalogueId, battleSize, waivedRules, detachmentIds))
  return { loaded, rules }
}
