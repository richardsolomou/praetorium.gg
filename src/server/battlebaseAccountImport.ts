import { app } from './app'
import { battlebaseBattlePage, battlebaseBattles, battlebaseCode, battlebasePlayer } from './battlebase'
import { battlebaseNames } from './battlebaseData'
import { battlebaseContext, importFactions } from './battlebaseImport'
import { inTurn } from './rpc'

export async function linkedBattlebaseAccount(userId: string) {
  const accounts = await app().repository.externalAccountsByUser(userId)
  return accounts.find((account) => account.source === 'battlebase') ?? null
}

const ASSISTANT_IMPORT_PAGE = 20

export async function importBattlebaseHistory(userId: string, username?: string, page?: { before?: string }) {
  const instance = app()
  const linked = await linkedBattlebaseAccount(userId)
  const proving = !linked || (username !== undefined && username.toLowerCase() !== linked.name.toLowerCase())
  const signal = page ? AbortSignal.timeout(25_000) : undefined
  const player = await beforeImportDeadline(
    battlebasePlayer(proving ? { username: username ?? '' } : { id: linked.playerId }, signal),
    signal,
  )
  if (!player) return { outcome: 'not-found' as const }
  if (proving && !player.tagline?.includes(battlebaseCode(userId, player.username))) return { outcome: 'unverified' as const }
  const [loaded, rules] = [instance.catalogue(), await beforeImportDeadline(instance.rulesFor(), signal)]
  if (!loaded || !rules) throw new Response('Army data is unavailable. Try again later.', { status: 503 })
  const [factions, names, battles] = await beforeImportDeadline(
    Promise.all([
      instance.battleFactionsFor(),
      battlebaseNames(),
      page ? battlebaseBattlePage(player.id, ASSISTANT_IMPORT_PAGE, page.before, signal) : battlebaseBattles(player.id),
    ]),
    signal,
  )
  const joined = proving
    ? await instance.repository.linkExternalAccount({ source: 'battlebase', playerId: player.id, userId, name: player.username })
    : 0
  const nextCursor = page && battles.length === ASSISTANT_IMPORT_PAGE ? battles.at(-1)!.id : null
  const read = importFactions(factions, loaded)
  const outcomes = inTurn(battles, async (battle) =>
    instance.service.importBattlebaseBattle(userId, player.id, battle, (parsed) =>
      battlebaseContext(parsed, { loaded, rules, factions: read, names }),
    ),
  )
  // Each battle streams its outcome as it comes in; the totals follow the last.
  const counts = Promise.all(outcomes).then((done) => {
    const tally = { imported: 0, joined: 0, alreadyImported: 0, unfinished: 0, skipped: 0 }
    for (const outcome of done) tally[outcome]++
    // Linking can claim seats anywhere in the account's history, beyond the current import page.
    return page ? tally : { ...tally, joined: tally.joined + joined, alreadyImported: Math.max(0, tally.alreadyImported - joined) }
  })
  return { outcome: 'imported' as const, username: player.username, outcomes, counts, nextCursor, linkedSeats: joined }
}

function beforeImportDeadline<T>(result: Promise<T>, signal?: AbortSignal) {
  if (!signal) return result
  return new Promise<T>((resolve, reject) => {
    const expired = () => reject(new Response('BattleBase is taking too long. Retry this page shortly.', { status: 503 }))
    if (signal.aborted) expired()
    else signal.addEventListener('abort', expired, { once: true })
    void result.then(resolve, reject).finally(() => signal.removeEventListener('abort', expired))
  })
}
