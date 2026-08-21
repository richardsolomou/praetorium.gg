import type { battlesQuery } from '../../queries'

/** One row of the battle list, as the server hands it over. */
export type Battle = Awaited<ReturnType<NonNullable<ReturnType<typeof battlesQuery>['queryFn']>>>[number]
