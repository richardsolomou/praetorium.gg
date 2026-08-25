import type { battlesFrom } from '../../queries'

/** One row of the battle list, as the server hands it over. */
export type Battle = ReturnType<typeof battlesFrom>[number]
