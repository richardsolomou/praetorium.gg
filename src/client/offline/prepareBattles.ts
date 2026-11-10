import type { QueryClient } from '@tanstack/react-query'
import { battleQuery } from '../queries/battles'
import { chunks } from '../../core/collections'
import { localVersion } from './localRuntime'

/** Downloads each listed battle the device does not already hold at the version its row names, three at a time. */
export async function prepareBattles(
  client: QueryClient,
  battles: readonly { token: string; serverSeq: number }[],
  current: () => boolean,
) {
  for (const batch of chunks(battles, 3)) {
    if (!current()) return
    const versions = await Promise.all(batch.map((battle) => localVersion(`battle:${battle.token}`)))
    if (!current()) return
    const outdated = batch.filter((battle, at) => versions[at] !== battle.serverSeq)
    await Promise.allSettled(outdated.map((battle) => client.query({ ...battleQuery(battle.token), staleTime: Infinity })))
  }
}
