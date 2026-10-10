import { expect, it, vi } from 'vitest'
import { ALICE, NAMES, log, started } from '../core/battle.fixtures'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

for (const finished of [false, true]) {
  it.each(['screen', 'workspace', 'submit'] as const)(
    `${finished ? 'retains the finished' : 'omits the active'} replay timeline in the %s response`,
    async (path) => {
      const history = {
        battle: { id: 'battle', token: 'token', createdAt: 0 },
        players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
        log: finished ? log(...started(), [ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: ALICE }]) : log(...started()),
      }
      const repository = {
        battleHistoryByToken: vi.fn().mockResolvedValue(history),
        battleByToken: vi.fn().mockResolvedValue(history),
        submit: vi.fn().mockResolvedValue({ result: { outcome: 'appended', seq: history.log.length }, log: history.log }),
      } as unknown as RepositoryPort
      const service = new PraetoriumService(
        repository,
        () => 10,
        () => 0,
      )
      const screen =
        path === 'screen'
          ? await service.screen('token', ALICE)
          : path === 'workspace'
            ? (await service.battleWorkspace('token', ALICE)).screen
            : (await service.submit('token', ALICE, history.log.length - 1, history.log.at(-1)!.command)).screen
      expect(
        screen.kind === 'battle'
          ? { status: screen.view.status, seq: screen.timeline?.at(-1)?.seq, text: screen.timeline?.at(-1)?.text }
          : null,
      ).toEqual({
        status: finished ? 'finished' : 'playing',
        seq: finished ? history.log.length : undefined,
        text: finished ? 'Alice concedes' : undefined,
      })
    },
  )
}
