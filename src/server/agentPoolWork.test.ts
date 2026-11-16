import { expect, it } from 'vitest'
import { agentPoolWork } from './agentPoolWork'

it('queues roster-wide runs behind the two running, even after one failed, and turns away the one past the queue', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const failed = agentPoolWork(() => Promise.reject(new Error('worker stopped')))
  await expect(failed).rejects.toThrow('worker stopped')
  const runs = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].map((name) => agentPoolWork(() => held.then(() => name)))
  const refused = await agentPoolWork(async () => 'seventh')
  release()
  expect([...(await Promise.all(runs)), refused]).toEqual(['first', 'second', 'third', 'fourth', 'fifth', 'sixth', null])
})
