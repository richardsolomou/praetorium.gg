import { z } from 'zod'

export const MAX_HOME_WIDGET_BYTES = 8_000
export const HOME_WIDGET_ITEMS = 4

const homeWidgetSchema = z.object({
  version: z.literal(1),
  updatedAt: z.number().nonnegative(),
  items: z
    .array(
      z.object({
        kind: z.enum(['battle', 'league', 'roster', 'tournament']),
        title: z.string().max(120),
        detail: z.string().max(120),
        path: z.string().startsWith('/').max(500),
        /** When it is due, for the widget to count down to; null when it has no deadline. */
        due: z.number().nonnegative().nullable(),
        urgent: z.boolean(),
      }),
    )
    .max(HOME_WIDGET_ITEMS),
})

/** What the home screen widget shows: the things waiting on the player, most pressing first, as home lists them. */
export type HomeWidget = z.infer<typeof homeWidgetSchema>

export function parseHomeWidget(value: unknown): HomeWidget | null {
  const parsed = homeWidgetSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
