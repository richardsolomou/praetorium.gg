import { describe, expect, it, vi } from 'vitest'
import type { Roster } from '../../core/battle'
import type { RepositoryPort } from '../spacetimeRepository'
import { SealedEventService } from './sealedEventService'

const list: Roster = {
  name: 'Army',
  text: 'Army',
  built: { catalogueId: 'c', revision: 'r', limit: 2000, detachment: 'd', disposition: null, dispositions: ['recon', 'take'], units: [] },
}
const saved = { id: 'roster', limit: 2000, updatedAt: 1 }

function seal(format: '1v1' | '2v2', disposition?: string) {
  const submitSealedEventRoster = vi.fn().mockResolvedValue({ outcome: 'sealed', format, requiredLimit: 2000 })
  const sealedEventByToken = vi.fn().mockResolvedValue({ format, rosterLimit: 2000, entries: [{ userId: 'player', requiredLimit: 2000 }] })
  const service = new SealedEventService({ submitSealedEventRoster, sealedEventByToken } as unknown as RepositoryPort, () => 1, {
    notify: vi.fn(),
  })
  const sealing = service.submitSealedEventRoster('event', 'player', saved, list, undefined, disposition)
  return { sealing, sealed: () => JSON.parse(submitSealedEventRoster.mock.calls[0]![0].snapshot as string) as Roster }
}

describe('sealing a list’s Force Disposition', () => {
  it('refuses a lone list that names none of the cards it offers', async () => {
    await expect(seal('1v1').sealing).rejects.toMatchObject({ status: 409 })
  })

  it('seals the card a lone entrant chose', async () => {
    const { sealing, sealed } = seal('1v1', 'take')
    await sealing
    expect(sealed().built?.disposition).toBe('take')
  })

  it('refuses a card the list does not offer', async () => {
    await expect(seal('1v1', 'purge').sealing).rejects.toMatchObject({ status: 409 })
  })

  it('leaves a pair’s card to the pair', async () => {
    await expect(seal('2v2').sealing).resolves.toMatchObject({ outcome: 'sealed' })
  })
})
