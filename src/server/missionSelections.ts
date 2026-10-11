import { createHash } from 'node:crypto'
import type { MissionSelectionKind } from '../core/missionSelections'

const chapterApproved = '4f285f2e-3c40-40fb-8b2f-bfccd173f1fd'
const selections: Record<string, { kind: MissionSelectionKind; description: string }> = {
  // https://assets.warhammer-community.com/40k_missions-apr3-image2-klygb0dtwq.jpg
  '2a68706e-fa98-4c79-a431-67069fb93f4e': {
    kind: 'punishment',
    description: '2ce87e95474fb036fa8c051d4a8f10c983434e93991e6c395e06d84347d49b63',
  },
  // Printed cards: https://www.youtube.com/watch?v=sp6n_Bl6MJ0&t=6829s and &t=6940s.
  '6973d6b9-7be3-4367-b3a8-972181decc82': {
    kind: 'guards',
    description: '250e011185a9259907c5101df2c4adb0f651fa01f5a76701f6e5311855f52656',
  },
  'd9885cd4-b11b-4a8b-9bd1-b95d184ca08f': {
    kind: 'tempting-target',
    description: '347dd7d731fe17ad754828ce320f8c17c9601d0f9bb98d7c0d0e02a29bea7c1b',
  },
  // Manual tracking; the original card's full eligibility contract is unverified.
  '46466800-24ac-47f2-9c4e-587b927e0e50': {
    kind: 'beacon',
    description: '08a5e06f93400b5f465a1e6947bce7053daa745357d34a634edf456327945fa9',
  },
}

export function missionSelectionKind(packId: unknown, cardId: string, description: string | null): MissionSelectionKind | undefined {
  const selection = selections[cardId]
  if (packId !== chapterApproved || !selection || !description) return undefined
  return createHash('sha256').update(description).digest('hex') === selection.description ? selection.kind : undefined
}
