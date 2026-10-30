import { expect, it, vi } from 'vitest'
import { printDocument } from './printing'

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
