import { app } from './app'
import { battlebaseBattles, battlebaseCode, battlebasePlayer } from './battlebase'
import { battlebaseNames } from './battlebaseData'
import { battlebaseContext } from './battlebaseImport'
import { inTurn } from './rpc'

export async function linkedBattlebaseAccount(userId: string) {
  const accounts = await app().repository.externalAccountsByUser(userId)
  return accounts.find((account) => account.source === 'battlebase') ?? null
}

export async function importBattlebaseHistory(userId: string, username?: string) {
  const instance = app()
  const linked = await linkedBattlebaseAccount(userId)
  const proving = username && username.toLowerCase() !== linked?.name.toLowerCase()
  const player = await battlebasePlayer(proving || !linked ? { username: username ?? '' } : { id: linked.playerId })
  if (!player) return { outcome: 'not-found' as const }
  let joined = 0
  if (proving || !linked) {
    if (!player.tagline?.includes(battlebaseCode(userId, player.username))) return { outcome: 'unverified' as const }
    joined = await instance.repository.linkExternalAccount({ source: 'battlebase', playerId: player.id, userId, name: player.username })
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
}
