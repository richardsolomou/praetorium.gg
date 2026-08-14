import { expect, test, type Page } from '@playwright/test'
import { createRoster, setupBattle, signUp, uniqueName } from './account'

test('a player tapping twice in a row does not lose the race to themselves', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Death Lord/, name: 'Death Guard' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  const link = await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  await slowRefetch(alice, token(link))
  const score = alice.getByRole('button', { name: '+1 additional CP' })
  await score.click()
  await score.click()

  const cp = alice.locator('[data-panel="player"]').filter({ hasText: 'Necrons' }).locator('[data-stat="cp"]')
  await expect(alice.getByText('Your opponent got there first. Try that again.')).toBeHidden()
  await expect(cp).toHaveText('3')
  await alice.getByRole('button', { name: 'Undo' }).click()
  await expect(alice.getByText('only the last action can be undone')).toBeHidden()
  await expect(cp).toHaveText('2')
})

function token(link: string) {
  return link.slice(link.lastIndexOf('/') + 1)
}

async function slowRefetch(page: Page, battleToken: string) {
  await page.route('**/_serverFn/**', async (route) => {
    const reading = route.request().method() === 'GET' && decodeURIComponent(route.request().url()).includes(battleToken)
    if (reading) await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })
}
