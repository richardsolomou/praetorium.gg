import { expect, it, vi } from 'vitest'
import { printDocument } from './printing'

it('leaves twelve millimetres around HTML sent to the system printer', async () => {
  const print = vi.fn().mockResolvedValue(undefined)
  await printDocument('<html>Army</html>', print)
  expect(print).toHaveBeenCalledWith({
    html: '<html>Army</html>',
    margins: { top: 34.02, right: 34.02, bottom: 34.02, left: 34.02 },
  })
})

it('returns normally when the player closes the iOS print sheet', async () => {
  const print = vi.fn().mockRejectedValue({ code: 'ERR_PRINT_INCOMPLETE' })
  await expect(printDocument('<html>Army</html>', print)).resolves.toBeUndefined()
})

it.each([{ code: 'ERR_PRINTING_JOB_FAILED' }, { message: 'Printing did not complete' }, null])(
  'preserves a print failure without the cancellation code: %j',
  async (failure) => {
    const print = vi.fn().mockRejectedValue(failure)
    await expect(printDocument('<html>Army</html>', print)).rejects.toBe(failure)
  },
)
