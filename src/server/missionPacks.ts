import fs from 'node:fs'
import path from 'node:path'
import type { SourceTexts, TextTransform } from '../shared/sourceText'
import { publishedTexts } from './sourceTexts'

/**
 * A mission pack as the datacards source writes one, parsed once.
 *
 * Three separate things are read out of these files — what each payout on a card
 * asks for, the twists a pack offers, and the ceilings it puts on scoring — and each
 * of them used to open and parse every pack for itself. The packs are large enough
 * that reading them three times is a second and a third copy of the same object
 * graph on every boot and every catalogue refresh, so they are read here once and
 * handed to whoever needs them.
 */
export type MissionPack = Record<string, unknown>

/** How each pack's strings are published, by the file it was read from. */
const packTexts = new WeakMap<MissionPack, SourceTexts>()

/** Every pack under `<directory>/missions`, or none where there is no such directory. */
export function readMissionPacks(directory: string, textsFor: (file: string) => SourceTexts = publishedTexts): MissionPack[] {
  const missions = path.join(directory, 'missions')
  if (!fs.existsSync(missions)) return []
  return fs
    .readdirSync(missions)
    .filter((entry) => entry.endsWith('.json'))
    .flatMap((fileName): MissionPack[] => {
      const file = path.join(missions, fileName)
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!parsed || typeof parsed !== 'object') return []
      packTexts.set(parsed as MissionPack, textsFor(file))
      return [parsed as MissionPack]
    })
}

/**
 * A pack's string as Praetorium publishes it: a token for the words the pack states, or
 * null where it states none. A pack read some other way publishes tokens no file answers.
 */
export function packText(pack: MissionPack, value: unknown, transform: TextTransform = 'trim'): string | null {
  const raw = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as Record<string, unknown>).en : null
  if (typeof raw !== 'string' || !raw.trim()) return null
  return (packTexts.get(pack) ?? publishedTexts('missions'))(raw, transform)
}

export { english } from '../shared/datacards'

/**
 * Every primary and secondary card a pack prints, in the order it prints them.
 *
 * A pack's two card lists are read the same way by everything that reads a card at
 * all — what its payouts ask for, and the action it puts a unit up to — so the
 * traversal lives here rather than once per reading.
 */
export function missionCards(pack: unknown): Record<string, unknown>[] {
  if (!pack || typeof pack !== 'object') return []
  return ['primaryMissions', 'secondaryMissions'].flatMap((field) => {
    const cards: unknown = (pack as Record<string, unknown>)[field]
    return Array.isArray(cards) ? cards.filter((card): card is Record<string, unknown> => Boolean(card) && typeof card === 'object') : []
  })
}
