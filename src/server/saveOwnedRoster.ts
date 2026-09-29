import type { z } from 'zod'
import { app } from './app'
import { calculateRosterTotals } from './pricing'
import type { saveRosterSchema } from './schemas'

export async function saveOwnedRoster(userId: string, data: z.infer<typeof saveRosterSchema>) {
  const instance = app()
  const automaticName = !data.name
  const totals = automaticName
    ? calculateRosterTotals(
        { ...data, units: data.picks },
        await instance.catalogueFor(data.catalogueId),
        await instance.rosterLabelRulesFor(),
      )
    : null
  return instance.service.saveRoster(userId, {
    ...data,
    name: data.name || totals?.label || '',
    automaticName,
  })
}
