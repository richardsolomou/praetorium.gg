import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { battlebaseBattles, battlebaseCode, battlebasePlayer } from '../battlebase'
import { battlebaseNames } from '../battlebaseData'
import { battlebaseContext } from '../battlebaseImport'
import { requireUserId } from '../playerSession'
import { inTurn, mutationRpc, rpc } from '../rpc'
import { battlebaseImportSchema, battlebaseUsernameSchema } from '../../contracts/schemas'

/** The code this account puts in its BattleBase tagline to show the BattleBase account is its own. */
export const battlebaseImportCode = createServerFn({ method: 'GET' })
  .validator(battlebaseUsernameSchema)
  .handler(({ data }) => rpc(async () => ({ code: battlebaseCode(await requireUserId(), data.username) })))

/** The BattleBase account this player proved is theirs, if any. */
export const battlebaseAccount = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const accounts = await app().service.externalAccounts(await requireUserId())
    const linked = accounts.find((account) => account.source === 'battlebase')
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
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const instance = app()
      const linked = (await instance.service.externalAccounts(userId)).find((account) => account.source === 'battlebase')
      const proving = data.username && data.username.toLowerCase() !== linked?.name.toLowerCase()
      const player = await battlebasePlayer(proving || !linked ? { username: data.username ?? '' } : { id: linked.playerId })
      if (!player) return { outcome: 'not-found' as const }
      let joined = 0
      if (proving || !linked) {
        if (!player.tagline?.includes(battlebaseCode(userId, player.username))) return { outcome: 'unverified' as const }
        joined = await instance.service.linkExternalAccount({ source: 'battlebase', playerId: player.id, userId, name: player.username })
      }
      const [loaded, rules] = [instance.catalogue(), await instance.rulesFor()]
      if (!loaded || !rules) throw new Response('Army data is unavailable. Try again later.', { status: 503 })
      const [factions, names, battles] = await Promise.all([instance.battleFactionsFor(), battlebaseNames(), battlebaseBattles(player.id)])
      const outcomes = inTurn(battles, async (battle) =>
        instance.service.importBattlebaseBattle(userId, player.id, battle, (parsed) =>
          battlebaseContext(parsed, { loaded, rules, factions, names }),
        ),
      )
      // Each battle streams its outcome as it comes in; the totals follow the last.
      const counts = Promise.all(outcomes).then((done) => {
        const tally = { imported: 0, joined: 0, alreadyImported: 0, unfinished: 0, skipped: 0 }
        for (const outcome of done) tally[outcome]++
        // Linking already seated the account in the battles it joined, which the import then finds it in.
        return { ...tally, joined: tally.joined + joined, alreadyImported: Math.max(0, tally.alreadyImported - joined) }
      })
      return { outcome: 'imported' as const, username: player.username, outcomes, counts }
    }),
  )
