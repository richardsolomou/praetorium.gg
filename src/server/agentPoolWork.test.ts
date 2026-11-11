import { expect, it } from 'vitest'
import { agentPoolWork } from './agentPoolWork'

it('turns away a third roster-wide run until one finishes, even one that failed', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const first = agentPoolWork(() => held.then(() => 'first'))
  const second = agentPoolWork(() => Promise.reject(new Error('worker stopped')))
  await expect(second).rejects.toThrow('worker stopped')
  const third = agentPoolWork(() => held.then(() => 'third'))
  const fourth = await agentPoolWork(async () => 'fourth')
  release()
  expect([await first, await third, fourth, await agentPoolWork(async () => 'after')]).toEqual(['first', 'third', null, 'after'])
})
