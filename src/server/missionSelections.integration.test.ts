import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { missionSelectionKind } from './missionSelections'

const file = path.resolve('catalogue-data/datacards/11th/gdc/missions/chapter_approved_2026_2027.json')
const pinned = fs.existsSync(file)
const pack = () => JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>[]> & { id: string }
const card = (name: string) =>
  structuredClone(
    [...pack().primaryMissions!, ...pack().secondaryMissions!].find((raw) => (raw.name as { en: string }).en === name)!,
  ) as Record<string, unknown> & { actions: Record<string, { en: string }>[] }

it.skipIf(!pinned)('grants each verified capability from the pinned pack wording', () => {
  expect(
    ['Punishment', 'Burden Of Trust', 'A Tempting Target', 'Beacon', 'Locate and Deny', 'Extract Relic', 'Consecrate'].map((name) =>
      missionSelectionKind(pack().id, card(name)),
    ),
  ).toEqual(['punishment', 'guards', 'tempting-target', 'beacon', 'locate-and-deny', 'sensor-sweep', 'consecrate'])
})

it.skipIf(!pinned)('withdraws the capability when the printed action changes', () => {
  const relic = card('Extract Relic')
  relic.actions[0]!.restrictionText = { en: 'None.' }
  expect(missionSelectionKind(pack().id, relic)).toBeUndefined()
})

it.skipIf(!pinned)('does not grant a capability to the same card from another pack', () => {
  expect(missionSelectionKind('another-pack', card('Consecrate'))).toBeUndefined()
})
