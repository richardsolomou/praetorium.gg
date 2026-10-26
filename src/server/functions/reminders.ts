import { createServerFn } from '@tanstack/react-start'
import { reminderAbilitiesSchema, removeAbilityReminderSchema, setAbilityReminderSchema } from '../../contracts/schemas'
import { datasheetReminderAbilities } from '../../shared/reminderAbilities'
import { app } from '../app'
import { forSignedIn, requireUserId } from '../playerSession'
import { productActions } from '../productActions'
import { mutationRpc, rpc } from '../rpc'

/** Empty for a visitor, whose alerts stay in their browser. */
export const abilityReminders = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.abilityReminders(id))),
)

export const setAbilityReminder = createServerFn({ method: 'POST' })
  .validator(setAbilityReminderSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setAbilityReminder(userId, data)
    }),
  )

export const removeAbilityReminder = createServerFn({ method: 'POST' })
  .validator(removeAbilityReminderSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.removeAbilityReminder(userId, data)
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
