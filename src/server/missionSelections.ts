import { hash } from 'node:crypto'
import type { MissionSelectionKind } from '../core/missionSelections'
import { english, records } from '../shared/datacards'

const chapterApproved = '4f285f2e-3c40-40fb-8b2f-bfccd173f1fd'
const selections: Record<string, { kind: MissionSelectionKind; wording: string }> = {
  // https://assets.warhammer-community.com/40k_missions-apr3-image2-klygb0dtwq.jpg
  '2a68706e-fa98-4c79-a431-67069fb93f4e': {
    kind: 'punishment',
    wording: '2ce87e95474fb036fa8c051d4a8f10c983434e93991e6c395e06d84347d49b63',
  },
  // Printed cards: https://www.youtube.com/watch?v=sp6n_Bl6MJ0&t=6829s and &t=6940s.
  '6973d6b9-7be3-4367-b3a8-972181decc82': {
    kind: 'guards',
    wording: '250e011185a9259907c5101df2c4adb0f651fa01f5a76701f6e5311855f52656',
  },
  'd9885cd4-b11b-4a8b-9bd1-b95d184ca08f': {
    kind: 'tempting-target',
    wording: '347dd7d731fe17ad754828ce320f8c17c9601d0f9bb98d7c0d0e02a29bea7c1b',
  },
  // Manual tracking; the original card's full eligibility contract is unverified.
  '46466800-24ac-47f2-9c4e-587b927e0e50': {
    kind: 'beacon',
    wording: '08a5e06f93400b5f465a1e6947bce7053daa745357d34a634edf456327945fa9',
  },
  // Locate and Deny's start-of-battle markers and its Sensor Sweep, checked against the pinned pack wording.
  'be3afaf6-8886-45d3-b95e-7a7199fd202e': {
    kind: 'locate-and-deny',
    wording: 'f82ae12db3ed1c6fe01f5fcd5f052e6a23fcb201faf4b370543630a05ca3d85c',
  },
  // Extract Relic prints only the Sensor Sweep action that removes the opposing Locate and Deny markers.
  'a40202a3-6558-4ce8-971f-f6dbaf00933f': {
    kind: 'sensor-sweep',
    wording: 'c5e5960e0b4465f57b5a8f25e7bcd38c2a6694c583438ad859d04640add1d0d5',
  },
  'c0160440-ab79-4cb2-af8a-7b8eb2f832f0': {
    kind: 'consecrate',
    wording: 'a1cf40d3c6559cd4cc10559e7ca4d124999f334e82a24f6c2364abb594cf70f5',
  },
}

const actionFields = ['name', 'startsText', 'completesText', 'effectText', 'unitsText', 'useLimitText', 'restrictionText'] as const

/** The card's own description and printed actions, so a changed action also withdraws the capability. */
function wording(raw: Record<string, unknown>): string {
  return [english(raw.description), ...records(raw, 'actions').flatMap((action) => actionFields.map((field) => english(action[field])))]
    .filter(Boolean)
    .join('\n')
}

export function missionSelectionKind(packId: unknown, raw: Record<string, unknown>): MissionSelectionKind | undefined {
  const selection = typeof raw.id === 'string' ? selections[raw.id] : undefined
  const text = wording(raw)
  if (packId !== chapterApproved || !selection || !text) return undefined
  return hash('sha256', text) === selection.wording ? selection.kind : undefined
}
