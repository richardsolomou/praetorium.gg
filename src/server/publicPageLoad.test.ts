import { expect, it } from 'vitest'
import { publicPageLoad } from './publicPageLoad'

const pending = () => {
  let finish!: () => void
  const done = new Promise<string>((resolve, reject) => (finish = () => reject(new Error('render failed'))))
  done.catch(() => {})
  return { render: () => done, finish }
}

it('turns a render away while the limit is in flight', async () => {
  const load = publicPageLoad(1)
  void load(pending().render).catch(() => {})
  const response = await load(async () => 'page')
  expect(response instanceof Response && response.status).toBe(503)
})

it('takes renders again once a failed one has let go of its slot', async () => {
  const load = publicPageLoad(1)
  const first = pending()
  const running = load(first.render)
  first.finish()
  await expect(running).rejects.toThrow('render failed')
  expect(await load(async () => 'page')).toBe('page')
})
