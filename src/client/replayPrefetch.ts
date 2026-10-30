import { REPLAY_BATCH_SIZE } from '../contracts/battles'
import { chunks } from '../core/collections'

export function replayPreloadBatches(points: readonly { seq: number }[], latestSeq: number): number[][] {
  const seqs = points
    .filter((point) => point.seq < latestSeq)
    .toReversed()
    .map((point) => point.seq)
  return chunks(seqs, REPLAY_BATCH_SIZE)
}
