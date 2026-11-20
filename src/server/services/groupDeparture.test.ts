import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from '../spacetimeRepository'
import { GroupService } from './groupService'

it('tells the allies a departing member unsealed to seal again', async () => {
  const notify = vi.fn()
  const leaveGroup = vi.fn().mockResolvedValue({ resealed: [{ eventToken: 'game', userIds: ['ally'] }] })
  await new GroupService({ leaveGroup } as Partial<RepositoryPort> as RepositoryPort, () => 1, { notify }).leaveGroup('group', 'leaver')
  expect(notify).toHaveBeenCalledExactlyOnceWith([
    { kind: 'sealed-event-roster-reseal', actorId: 'leaver', recipientIds: ['ally'], sealedEventToken: 'game' },
  ])
})
