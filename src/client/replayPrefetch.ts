import { REPLAY_BATCH_SIZE } from '../contracts/battles'

export function replayPreloadBatches(points: readonly { seq: number }[], latestSeq: number): number[][] {
  const seqs = points
    .filter((point) => point.seq < latestSeq)
    .toReversed()
    .map((point) => point.seq)
  const batches: number[][] = []
  for (let offset = 0; offset < seqs.length; offset += REPLAY_BATCH_SIZE) {
    batches.push(seqs.slice(offset, offset + REPLAY_BATCH_SIZE))
  }
  return batches
}
