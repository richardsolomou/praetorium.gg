import { expect, it } from 'vitest'
import { withWorkerAppContext, workerAppContext } from './workerAppContext'

it('keeps concurrent request contexts separate across awaits', async () => {
  const requests = [1, 2].map((id) =>
    withWorkerAppContext(async () => {
      workerAppContext.getStore()!.app = { id }
      await Promise.resolve()
      return workerAppContext.getStore()!.app
    }),
  )

  expect(await Promise.all(requests)).toEqual([{ id: 1 }, { id: 2 }])
})
