import type { openClub } from '../../functions'

export type Club = NonNullable<Awaited<ReturnType<typeof openClub>>>
