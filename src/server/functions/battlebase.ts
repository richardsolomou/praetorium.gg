import { createServerFn } from '@tanstack/react-start'
import { battlebaseCode } from '../battlebase'
import { importBattlebaseHistory, linkedBattlebaseAccount } from '../battlebaseAccountImport'
import { requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { battlebaseImportSchema, battlebaseUsernameSchema } from '../../contracts/schemas'

/** The code this account puts in its BattleBase tagline to show the BattleBase account is its own. */
export const battlebaseImportCode = createServerFn({ method: 'GET' })
  .validator(battlebaseUsernameSchema)
  .handler(({ data }) => rpc(async () => ({ code: battlebaseCode(await requireUserId(), data.username) })))

/** The BattleBase account this player proved is theirs, if any. */
export const battlebaseAccount = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const linked = await linkedBattlebaseAccount(await requireUserId())
    return linked ? { username: linked.name } : null
  }),
)

/**
 * Links the BattleBase account a username names once its tagline carries this player's code, and
 * imports its finished public battles, streaming each battle's outcome and then the totals. Without
 * a username it imports again from the linked account.
 */
export const importBattlebaseBattles = createServerFn({ method: 'POST' })
  .validator(battlebaseImportSchema)
  .handler(({ data }) => mutationRpc(async () => importBattlebaseHistory(await requireUserId(), data.username)))
