import { expect, test, type Page } from '@playwright/test'

/**
 * A player acting twice in a row, on a connection where the refetch behind the
 * first command has not landed yet.
 *
 * Localhost hides this: the read returns before a hand can move. Deployed behind
 * a CDN it is the ordinary case — mustering is several commands in a row — and the
 * second one was being rejected with `stale`, telling a player their opponent got
 * there first when their opponent had done nothing at all. Reads are delayed here
 * to make that window wide enough to act inside, deterministically.
 */
test('a player tapping twice in a row does not lose the race to themselves', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()

  await alice.goto('/')
  await alice.getByLabel('Your name').fill('Alice')
  await alice.getByRole('button', { name: 'Open a battle' }).click()
  const invite = alice.getByLabel('Send this link to your opponent')
  await expect(invite).toHaveValue(/\/b\//)
  const link = await invite.inputValue()

  await bob.goto(link)
  await bob.getByLabel('Your name').fill('Bob')
  await bob.getByRole('button', { name: 'Join the battle' }).click()

  await paste(alice, 'Ultramarines', '10 Intercessors')
  await paste(bob, 'Death Guard', '10 Plague Marines')
  await alice.getByRole('button', { name: 'Alice goes first' }).click()
  await expect(alice.getByRole('heading', { name: 'command phase' })).toBeVisible()

  await slowRefetch(alice, token(link))

  const score = alice.getByRole('button', { name: 'Primary plus 5' })
  await score.click()
  await score.click()

  const primary = alice.locator('section').filter({ hasText: 'Ultramarines' }).locator('[data-stat="primary"]')
  await expect(alice.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await expect(primary).toHaveText('10')

  // Undo names a command out of the view, so the view has to be the one the last
  // command produced: naming the one before it is refused, not silently wrong.
  await alice.getByRole('button', { name: 'Undo' }).click()
  await expect(alice.getByText('only the last action can be undone')).toBeHidden()
  await expect(primary).toHaveText('5')
})

function token(link: string) {
  return link.slice(link.lastIndexOf('/') + 1)
}

/**
 * Holds this battle's read back, and nothing else: commands stay as fast as they
 * were, which is what leaves a page's own last command ahead of what it can see.
 */
async function slowRefetch(page: Page, battleToken: string) {
  await page.route('**/_serverFn/**', async (route) => {
    const reading = route.request().method() === 'GET' && decodeURIComponent(route.request().url()).includes(battleToken)
    if (reading) await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })
}

async function paste(page: Page, army: string, list: string) {
  const button = page.getByRole('button', { name: 'Paste a list' })
  if (await button.isVisible()) await button.click()
  await page.getByLabel('Your army').fill(army)
  await page.getByLabel('Your list').fill(list)
  await page.getByRole('button', { name: /my list/ }).click()
}
