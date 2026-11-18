import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { unitsSchema } from '../contracts/schemas'
import { replaceFileSync } from './replaceFile'
import { reportServerFailure } from './serverTelemetry'

const pickerSchema = unitsSchema.omit({ query: true })
export type Picker = z.infer<typeof pickerSchema>

const LIMIT = 200
const WRITE_DELAY_MS = 60_000

/**
 * The pickers rosters opened most recently, newest first, kept on the data volume so a new process can build them
 * before players reopen those rosters. They name books, battle sizes and detachments, never a roster or player.
 */
export function recentPickers(file: string) {
  let pickers: Picker[] | null = null
  let pending: NodeJS.Timeout | null = null
  const read = () => (pickers ??= readPickers(file))
  const write = () => {
    pending = null
    try {
      replaceFileSync(file, (temporary) => fs.writeFileSync(temporary, JSON.stringify(read())))
    } catch (error) {
      reportServerFailure({ event: 'recent_pickers_write_failed', error }, 'warn')
    }
  }
  return {
    list: (): readonly Picker[] => read(),
    record: (picker: Picker) => {
      const recorded: Picker = {
        catalogueId: picker.catalogueId,
        battleSize: picker.battleSize,
        waivedRules: picker.waivedRules?.length ? picker.waivedRules.toSorted() : undefined,
        detachmentIds: picker.detachmentIds?.length ? picker.detachmentIds : undefined,
      }
      const key = keyOf(recorded)
      pickers = [recorded, ...read().filter((each) => keyOf(each) !== key)].slice(0, LIMIT)
      pending ??= setTimeout(write, WRITE_DELAY_MS).unref()
    },
  }
}

/** Two requests for the same picker share a key whatever order their fields or waived rules come in. */
const keyOf = (picker: Picker) =>
  JSON.stringify([picker.catalogueId, picker.battleSize ?? null, picker.waivedRules?.toSorted() ?? [], picker.detachmentIds ?? []])

function readPickers(file: string): Picker[] {
  try {
    if (!fs.existsSync(file)) return []
    const parsed = z.array(z.unknown()).parse(JSON.parse(fs.readFileSync(file, 'utf8')))
    return parsed.flatMap((each) => {
      const picker = pickerSchema.safeParse(each)
      return picker.success ? [picker.data] : []
    })
  } catch (error) {
    reportServerFailure({ event: 'recent_pickers_read_failed', error }, 'warn')
    return []
  }
}

let shared: ReturnType<typeof recentPickers> | undefined

/** The process's store, on the data volume. */
export const pickersOpened = () =>
  (shared ??= recentPickers(path.join(path.resolve(process.env.DATA_DIR ?? '/data'), 'recent-pickers.json')))
