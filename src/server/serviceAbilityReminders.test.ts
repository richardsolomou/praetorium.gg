import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

const reminder = { key: 'datasheet:shroud', ability: 'Shroud', description: '', timings: [] }

const saving = (outcome: 'saved' | 'full') =>
  new PraetoriumService(
    { saveAbilityReminder: vi.fn().mockResolvedValue(outcome) } as unknown as RepositoryPort,
    () => 0,
    () => 0,
  ).setAbilityReminder('player', reminder)

it('refuses an alert past the limit as a conflict', async () => {
  await expect(saving('full')).rejects.toMatchObject({ status: 409 })
})

it('keeps an alert within the limit', async () => {
  await expect(saving('saved')).resolves.toBeUndefined()
})
