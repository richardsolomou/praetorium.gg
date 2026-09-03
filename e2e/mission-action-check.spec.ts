import { expect, type Locator, test } from '@playwright/test'
import { createRoster, setupBattle, setupStep, signUp, uniqueName } from './account'

test('a seated player can read the action a card in play names', async ({ browser }) => {
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  // The dev server hydrates slowly on first load, so both pages warm the route the
  // helpers click into before the helpers navigate to it themselves.
  const warm = async (page: typeof alice) => {
    await page.goto('/rosters', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2_000)
  }

  await signUp(bob, bobName)
  await warm(bob)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await signUp(alice, aliceName)
  await warm(alice)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await setupBattle(alice, bob, {
    opponent: bobName,
    hostRoster: aliceRoster,
    guestRoster: bobRoster,
    beforeStart: async () => {
      const press = async (button: Locator) => {
        await expect(async () => {
          if ((await button.getAttribute('aria-pressed')) === 'true') return
          await button.click({ timeout: 1_000 })
          await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
        }).toPass({ timeout: 10_000 })
      }
      await press(alice.getByRole('group', { name: 'Secondary play' }).getByRole('button', { name: 'Fixed' }))
      for (const card of ['Cleanse', 'Assassination']) {
        await press(alice.getByRole('button', { name: new RegExp(`^(Select|Remove) ${card}$`) }))
      }
      await setupStep(bob, 'Secondaries')
      await press(bob.getByRole('group', { name: 'Secondary play' }).getByRole('button', { name: 'Fixed' }))
      for (const card of ['Cleanse', 'Assassination']) {
        await press(bob.getByRole('button', { name: new RegExp(`^(Select|Remove) ${card}$`) }))
      }
    },
  })

  await alice.getByRole('button', { name: 'Read Cleanse' }).first().click()
  const dialog = alice.getByRole('dialog')
  await expect(dialog.getByText('CLEANSE', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: 'test-results/battle-action.png' })
  await Promise.all([aliceContext.close(), bobContext.close()])
})
