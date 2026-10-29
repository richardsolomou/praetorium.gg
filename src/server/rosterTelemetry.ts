import { listUnitCount } from '../core/attachedUnits'
import { rosterTelemetryProperties } from '../shared/rosterTelemetry'
import type { z } from 'zod'
import type { saveRosterSchema } from '../contracts/schemas'
import type { app } from './app'
import { captureWrite } from './mutationTelemetry'

export async function captureRosterCreated(
  instance: Pick<ReturnType<typeof app>, 'catalogueFor' | 'rulesFor'>,
  userId: string,
  data: z.infer<typeof saveRosterSchema>,
  { delivery = 'direct', ...extra }: { delivery?: 'sync' | 'direct'; variant?: boolean; played?: boolean } = {},
) {
  await captureWrite(userId, 'roster_created', delivery, {
    ...rosterTelemetryProperties(data, await instance.catalogueFor(data.catalogueId), await instance.rulesFor(data.catalogueId)),
    unit_count: listUnitCount(data.picks),
    source: data.source,
    visibility: data.visibility,
    ...extra,
  })
}
