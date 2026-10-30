export * from './queries/account'
export * from './queries/battles'
export * from './queries/changes'
export * from './queries/clubs'
export * from './queries/leagues'
export * from './queries/queryKeys'
export * from './queries/references'
export * from './queries/release'
export * from './queries/rosters'
export * from './queries/simulator'
export * from './queries/support'

/** What a query option factory's fetch resolves to: the query's data, or one page of an infinite query. */
export type QueryData<Options extends (...args: never[]) => { queryFn?: unknown }> = Awaited<
  ReturnType<Extract<ReturnType<Options>['queryFn'], (...args: never[]) => unknown>>
>
