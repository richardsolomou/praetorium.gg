import { journalOrder, type JournalEventInput, type JournalGameInput } from '../../core/gameJournal'
import type { RepositoryPort } from '../spacetimeRepository'

/** A player's own record of games played outside Praetorium, read and written only by that player. */
export class JournalService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
  ) {}

  async journal(userId: string) {
    const { events, games } = await this.repository.journal(userId)
    return { events: [...events].sort((left, right) => right.createdAt - left.createdAt), games: journalOrder(games) }
  }

  async saveGame(userId: string, game: JournalGameInput) {
    const outcome = await this.repository.saveJournalGame(userId, game, this.clock())
    if (outcome === 'forbidden') throw new Response('this game is not in your journal', { status: 403 })
    if (outcome === 'no-event') throw new Response('that event is not in your journal', { status: 409 })
    if (outcome === 'too-many') throw new Response('your journal is full; delete a game to record another', { status: 409 })
  }

  async deleteGame(userId: string, id: string) {
    if (!(await this.repository.deleteJournalGame(id, userId))) throw new Response('this game is not in your journal', { status: 404 })
  }

  async saveEvent(userId: string, event: JournalEventInput) {
    const outcome = await this.repository.saveJournalEvent(userId, event, this.clock())
    if (outcome === 'forbidden') throw new Response('this event is not in your journal', { status: 403 })
    if (outcome === 'too-many') throw new Response('your journal has too many events; delete one to add another', { status: 409 })
  }

  async deleteEvent(userId: string, id: string) {
    if (!(await this.repository.deleteJournalEvent(id, userId))) throw new Response('this event is not in your journal', { status: 404 })
  }
}
