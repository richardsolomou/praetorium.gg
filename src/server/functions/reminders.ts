import { createServerFn } from '@tanstack/react-start'
import { reminderAbilitiesSchema, removeAbilityReminderSchema, setAbilityReminderSchema } from '../../contracts/schemas'
import { datasheetReminderAbilities } from '../../shared/reminderAbilities'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { productActions } from '../productActions'
import { mutationRpc, rpc } from '../rpc'

/** Empty for a visitor, whose alerts stay in their browser. */
export const abilityReminders = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.abilityReminders(id) : []
  }),
)

export const setAbilityReminder = createServerFn({ method: 'POST' })
  .validator(setAbilityReminderSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.setAbilityReminder(player.id, data)
    }),
  )

export const removeAbilityReminder = createServerFn({ method: 'POST' })
  .validator(removeAbilityReminderSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.removeAbilityReminder(player.id, data)
    }),
  )

/** What each unit of a roster holds for alerts; a complete roster is too large for a query string, so this read uses POST. */
export const reminderAbilities = createServerFn({ method: 'POST' })
  .validator(reminderAbilitiesSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const loaded = await app().catalogueFor(data.catalogueId)
      return loaded ? datasheetReminderAbilities(loaded, await app().rulesFor(data.catalogueId), data) : []
    }),
  )
