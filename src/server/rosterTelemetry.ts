import { attachedUnitCount } from '../core/attachedUnits'
import { rosterTelemetryProperties } from '../shared/rosterTelemetry'
import type { z } from 'zod'
import type { saveRosterSchema } from '../contracts/schemas'
import type { app } from './app'

export async function captureRosterCreated(
  instance: Pick<ReturnType<typeof app>, 'telemetry' | 'catalogueFor' | 'rulesFor'>,
  userId: string,
  data: z.infer<typeof saveRosterSchema>,
  extra: { variant?: boolean } = {},
) {
  await instance.telemetry.capture(userId, 'roster_created', {
    ...rosterTelemetryProperties(data, await instance.catalogueFor(data.catalogueId), await instance.rulesFor(data.catalogueId)),
    unit_count: attachedUnitCount(data.picks.map((pick, key) => ({ key, attachedTo: pick.attachedTo }))),
    source: data.source,
    visibility: data.visibility,
    ...extra,
  })
}
