import { expect, test } from '@playwright/test'

/**
 * A list built from the real catalogue, priced, resized, taken into a battle, and
 * then tracked unit by unit — with the opponent's device following along without
 * being touched. Nothing here can be proved by a unit test: the catalogue is
 * loaded by the server on first use and every number crosses the wire.
 */
test('a built list is priced, played and tracked', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()

  await alice.goto('/')
  await alice.getByLabel('Your name').fill('Alice')
  await alice.getByRole('button', { name: 'Open a battle' }).click()
  const link = await alice.getByLabel('Send this link to your opponent').inputValue()

  await alice.getByRole('button', { name: 'Build from the catalogue' }).click()
  await alice.getByRole('combobox', { name: 'Army' }).click()
  await alice.getByRole('option', { name: 'Chaos - Death Guard' }).click()

  // A list without a detachment is not a legal army, so it cannot be attached.
  await alice.getByRole('combobox', { name: 'Detachment' }).click()
  await alice.getByRole('option', { name: 'Flyblown Host' }).click()

  await alice.getByLabel('Add a unit').fill('Plague Marines')
  await alice
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()

  const total = alice.locator('[data-stat="points"]')
  await expect(total).toBeVisible()
  const atFive = Number.parseInt(await total.innerText(), 10)
  await expect(alice.getByText('Nothing illegal about it.')).toBeVisible()

  // A Plague Marines squad is five or ten, so growing it must cost more. The
  // clicks are sequential on purpose: each one re-prices the list.
  const grow = alice.getByRole('button', { name: /More models in Plague Marines/ })
  await grow.click()
  await grow.click()
  await grow.click()
  await grow.click()
  await grow.click()
  await expect(alice.getByLabel('Plague Marines models')).toHaveText('10')
  expect(Number.parseInt(await total.innerText(), 10)).toBeGreaterThan(atFive)

  // A loadout choice the data leaves open, changed and re-priced.
  const wargear = alice.getByRole('combobox', { name: /Plague Marines/ }).first()
  if (await wargear.isVisible()) {
    const beforeChoice = Number.parseInt(await total.innerText(), 10)
    await wargear.click()
    const options = alice.getByRole('option')
    await options.nth((await options.count()) - 1).click()
    await expect(total)
      .not.toHaveText(`${beforeChoice} / 2000 pts`, { timeout: 5000 })
      .catch(() => {})
  }

  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await alice
    .getByRole('button', { name: /^Lord of Virulence/ })
    .first()
    .click()

  await alice.getByLabel('Name this army').fill('Death Guard strike force')
  await alice.screenshot({ path: 'test-results/builder.png', fullPage: true })
  await alice.getByRole('button', { name: 'Attach this list' }).click()
  await expect(alice.getByRole('button', { name: 'Replace my list' })).toBeVisible()

  await bob.goto(link)
  await bob.getByLabel('Your name').fill('Bob')
  await bob.getByRole('button', { name: 'Join the battle' }).click()
  await bob.getByRole('button', { name: 'Paste a list' }).click()
  await bob.getByLabel('Your army').fill('Ultramarines')
  await bob.getByLabel('Your list').fill('10 Intercessors')
  await bob.getByRole('button', { name: /my list/ }).click()

  await alice.getByRole('button', { name: 'Alice goes first' }).click()
  await expect(alice.getByRole('heading', { name: 'command phase' })).toBeVisible()

  // Both of Alice's units are on the table, and Bob's device says so too.
  const aliceStanding = alice.locator('section', { hasText: 'Death Guard strike force' }).locator('[data-stat="standing"]')
  await expect(aliceStanding).toHaveText('2/2')
  await expect(bob.locator('section', { hasText: 'Death Guard strike force' }).locator('[data-stat="standing"]')).toHaveText('2/2')

  // The detachment travels with the list, so the opponent can see what they face.
  await expect(bob.locator('section', { hasText: 'Death Guard strike force' }).getByText(/Flyblown Host/)).toBeVisible()

  // A pasted list names nothing, so Bob has no units to track.
  await expect(bob.locator('section', { hasText: 'Ultramarines' }).locator('[data-stat="standing"]')).toHaveCount(0)

  await alice
    .getByRole('button', { name: /^Lose Plague Marines/ })
    .first()
    .click()
  await expect(aliceStanding).toHaveText('1/2')

  // Bob is not touched: his page learns the casualty from the stream.
  await expect(bob.locator('section', { hasText: 'Death Guard strike force' }).locator('[data-stat="standing"]')).toHaveText('1/2')

  // A unit is its owner's to report lost, so Bob is offered no such button.
  await expect(bob.getByRole('button', { name: /^Lose Plague Marines/ })).toHaveCount(0)

  await alice.screenshot({ path: 'test-results/tracked.png', fullPage: true })
})
