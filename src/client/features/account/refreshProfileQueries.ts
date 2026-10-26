import type { QueryClient } from '@tanstack/react-query'
import { battlesQuery, friendshipsQuery, meQuery, opponentsQuery, userProfileKey } from '../../queries'

/** Every query that shows the signed-in player's name or picture. */
export async function refreshProfileQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey }),
    queryClient.invalidateQueries({ queryKey: friendshipsQuery().queryKey }),
    queryClient.invalidateQueries({ queryKey: opponentsQuery().queryKey }),
    queryClient.invalidateQueries({ queryKey: userProfileKey() }),
  ])
}
