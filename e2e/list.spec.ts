import { expect, test } from '@playwright/test'
import { attachRoster, createBattle, createRoster, startBattle, signUp, uniqueName, waitForRosterSave } from './account'

test('a built list is priced, deployed and tracked', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Death Lord/, name: 'Death Guard' })
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
    // eslint-disable-next-line no-await-in-loop
    await grow.click()
    // eslint-disable-next-line no-await-in-loop
    await expect(alice.getByLabel('Plague Marines models')).toHaveText(String(models))
  }
  expect(Number.parseInt(await total.innerText(), 10)).toBeGreaterThan(atFive)
  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await waitForRosterSave(alice, () => alice.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click())

  const link = await createBattle(alice, { opponent: bobName })
  await attachRoster(alice, aliceRoster)
  await bob.goto(link)
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(`${bobName} is ready.`)).toBeVisible()
  const lord = alice
    .locator('div')
    .filter({ hasText: /^Lord of Virulence/ })
    .filter({ has: alice.getByRole('button', { name: 'strategic reserves' }) })
  await lord.getByRole('button', { name: 'strategic reserves' }).click()
  await alice.getByRole('button', { name: 'Battle ready army · +10 VP' }).click()
  await startBattle(alice)
  await expect(bob.getByRole('heading', { name: 'command phase' })).toBeVisible()

  const panel = alice.locator('section').filter({ hasText: 'Death Guard' })
  const standing = panel.locator('[data-stat="standing"]')
  await expect(standing).toHaveText('2/2')
  await expect(panel.locator('[data-stat="vp"]')).toHaveText('10')
  await expect(
    bob
      .locator('section')
      .filter({ hasText: 'Death Guard' })
      .getByText(/Death Lord/),
  ).toBeVisible()

  await alice.getByRole('button', { name: /^Lose a model from Plague Marines/ }).click()
  await expect(alice.getByText('9/10')).toBeVisible()
  await alice
    .getByRole('button', { name: /^Lose Plague Marines/ })
    .first()
    .click()
  await expect(standing).toHaveText('1/2')
  await expect(bob.locator('section').filter({ hasText: 'Death Guard' }).locator('[data-stat="standing"]')).toHaveText('1/2')
  await expect(bob.getByRole('button', { name: /^Lose Plague Marines/ })).toHaveCount(0)

  await alice.getByRole('button', { name: 'Secondary plus 5' }).click()
  await expect(panel.locator('[data-stat="secondary"]')).toHaveText('5')
  await alice.screenshot({ path: 'test-results/tracked.png', fullPage: true })
})
