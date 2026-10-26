import { expect, test } from './test'
import {
  attachRoster,
  befriend,
  chooseBattlefield,
  createBattle,
  createRoster,
  desktopContext,
  retryUntilVisible,
  signUp,
  startBattle,
  uniqueName,
  addUnit,
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
  // The server prices the list, so the total follows the model count rather than changing with it.
  const total = alice.locator('[data-stat="points"]')
  const points = async () => Number.parseInt(await total.innerText(), 10)
  await expect.poll(points).toBeGreaterThan(0)
  const atFive = await points()
  await alice
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()
  const grow = alice.getByRole('button', { name: /More models in Plague Marines/ })
  for (let models = 6; models <= 10; models += 1) {
    await grow.click()
    await expect(alice.getByLabel('Plague Marines models')).toHaveText(String(models))
  }
  await expect.poll(points).toBeGreaterThan(atFive)
  await addUnit(alice, 'Lord of Virulence')

  await befriend(alice, bob)
  const link = await createBattle(alice, { opponent: bobName })
  await attachRoster(alice, aliceRoster)
  await bob.goto(link)
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()
  // The bonus is a fact about the army, so it is set where the army is chosen — claimed
  // as the army arrives, and given back from the same place.
  // Bob's device still writes derived setup facts after his army appears, and a setup
  // press that meets one comes back stale and is dropped, so repeat it like a player would.
  const remove = alice.getByRole('button', { name: new RegExp(`^Remove the battle ready bonus for ${aliceName}`) })
  const add = alice.getByRole('button', { name: new RegExp(`^Add the battle ready bonus for ${aliceName}`) })
  await retryUntilVisible(add, () => remove.click({ timeout: 1_000 }))
  await retryUntilVisible(remove, () => add.click({ timeout: 1_000 }))
  await chooseBattlefield(alice)
  await startBattle(alice)
  await expect(bob.getByRole('heading', { name: 'command phase' })).toBeVisible()

  const panel = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' })
  // The bonus is claimed during setup and paid as the battle begins, so it is already in the score.
  await expect(panel.locator('[data-stat="vp"]')).toHaveText('10')
  await expect(panel).toContainText('Battle ready included')
  await expect(
    bob
      .locator('[data-panel="player"]')
      .filter({ hasText: 'Death Guard' })
      .getByText(/Shamblerot Vectorium/),
  ).toBeVisible()

  await alice.screenshot({ path: test.info().outputPath('tracked.png'), fullPage: true })
})
