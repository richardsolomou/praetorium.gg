import { queryOptions } from '@tanstack/react-query'
import { journal } from '../functions'
import { SSR_STALE_TIME } from './shared'

/** The signed-in player's own record of games played outside Praetorium. */
export const journalQuery = () => queryOptions({ queryKey: ['journal'], queryFn: () => journal(), staleTime: SSR_STALE_TIME })
