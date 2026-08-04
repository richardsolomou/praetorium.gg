import { queryOptions } from '@tanstack/react-query'
import { me, openBattle } from '../server/fns'

export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => me() })

// No polling: `useLiveBattle` refetches this when the server says the battle changed.
export const battleQuery = (token: string) => queryOptions({ queryKey: ['battle', token], queryFn: () => openBattle({ data: { token } }) })
