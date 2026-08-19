import { expect, test } from '@playwright/test'
import { attachRoster, befriend, chooseBattlefield, createBattle, createRoster, setupStep, signUp, uniqueName } from './account'

test('battle setup stays in step and shows both players their shared choices', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Bob army' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Alice army' })
  await befriend(alice, bob)
  const url = await createBattle(alice, { opponent: bobName })
  await bob.goto(url)

  await expect(alice.getByRole('combobox', { name: 'Battle size' })).toContainText('Strike Force')
  await expect(alice.getByRole('button', { name: 'Reset setup' })).toHaveCount(0)
  await expect(alice.getByRole('button', { name: 'Delete battle' })).toHaveCount(0)

  await attachRoster(alice, aliceRoster)
  await expect(bob.getByText(aliceRoster, { exact: true }).first()).toBeVisible()
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()

  await alice.getByRole('button', { name: 'Change roster' }).click()
  await expect(alice.getByRole('dialog', { name: 'Choose your roster' })).toBeVisible()
  await alice.screenshot({ path: 'test-results/setup-roster-dialog.png', fullPage: true })
  await alice.keyboard.press('Escape')

  await chooseBattlefield(alice)
  await expect(bob.getByRole('button', { name: /^Selected layout / })).toBeVisible()
  await alice.getByRole('button', { name: 'View' }).first().click()
  await expect(alice.getByRole('dialog').getByRole('img')).toBeVisible()
  await alice.screenshot({ path: 'test-results/setup-battlefield-dialog.png', fullPage: true })
  await alice.keyboard.press('Escape')

  await setupStep(bob, 'Pre-battle')
  await expect(alice.getByText(/4 of 5 · Pre-battle/i)).toBeVisible()
  // Both sides are drawn, so each name appears on the table strip and again on its own column.
  await expect(alice.getByRole('main').getByText(aliceName, { exact: true }).first()).toBeVisible()
  await expect(alice.getByRole('main').getByText(bobName, { exact: true }).first()).toBeVisible()
  await alice.evaluate(() => window.scrollTo(0, 0))
  await alice.screenshot({ path: 'test-results/setup-armies.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  await alice.screenshot({ path: 'test-results/setup-armies-phone.png', fullPage: true })
})
