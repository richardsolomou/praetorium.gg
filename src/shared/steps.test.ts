import { expect, it } from 'vitest'
import { stepThrough, stepwise } from './steps'

function counted(units: number) {
  const built: number[] = []
  const work = stepwise(function* () {
    for (let unit = 0; unit < units; unit++) {
      built.push(unit)
      yield
    }
    return built.length
  })
  return { built, work }
}

it('finishes a background build on a read instead of starting it again', () => {
  const { built, work } = counted(4)
  work.step()
  work.step()
  work.get()
  expect(built).toEqual([0, 1, 2, 3])
})

it('pauses a shared build between its steps', () => {
  const { work } = counted(3)
  expect([...stepThrough(work)]).toHaveLength(3)
})

it('starts a failed build again on the next read', () => {
  let attempts = 0
  const work = stepwise(function* () {
    attempts++
    yield
    if (attempts === 1) throw new Error('unreadable')
    return attempts
  })
  expect(() => work.get()).toThrow('unreadable')
  expect(work.get()).toBe(2)
})
