import { expect, test } from '@playwright/test'
import {
  attachRoster,
  befriend,
  chooseBattlefield,
  createBattle,
  createRoster,
  desktopContext,
  setupStep,
  signUp,
  startBattle,
  uniqueName,
  waitForRosterSave,
} from './account'

test('a built list is priced, deployed and tracked', async ({ browser }) => {
  const alice = await (await browser.newContext(desktopContext)).newPage()
  const bob = await (await browser.newContext(desktopContext)).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await alice.getByLabel('Add a unit').fill('Plague Marines')
  await alice.getByRole('button', { name: 'Add Plague Marines', exact: true }).first().click()
  const total = alice.locator('[data-stat="points"]')
  const atFive = Number.parseInt(await total.innerText(), 10)
  await alice
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()
  const grow = alice.getByRole('button', { name: /More models in Plague Marines/ })
  for (let models = 6; models <= 10; models += 1) {
    await grow.click()
    await expect(alice.getByLabel('Plague Marines models')).toHaveText(String(models))
  }
  expect(Number.parseInt(await total.innerText(), 10)).toBeGreaterThan(atFive)
  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await waitForRosterSave(alice, () => alice.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click())

  await befriend(alice, bob)
  const link = await createBattle(alice, { opponent: bobName })
  await attachRoster(alice, aliceRoster)
  await bob.goto(link)
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()
  await chooseBattlefield(alice)
  await setupStep(alice, 'Pre-battle')
  await alice.getByRole('button', { name: /^Add the battle ready bonus for Death Guard/ }).click()
  await expect(alice.getByRole('button', { name: /^Remove the battle ready bonus for Death Guard/ })).toBeVisible()
  await startBattle(alice)
  await expect(bob.getByRole('heading', { name: 'command phase' })).toBeVisible()

  const panel = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' })
  // The bonus is promised during setup and paid when the battle ends, so the running score is still zero.
  await expect(panel.locator('[data-stat="vp"]')).toHaveText('0')
  await expect(panel).toContainText('+10 battle ready at the end')
  await expect(
    bob
      .locator('[data-panel="player"]')
      .filter({ hasText: 'Death Guard' })
      .getByText(/Shamblerot Vectorium/),
  ).toBeVisible()

  await alice.screenshot({ path: 'test-results/tracked.png', fullPage: true })
})
