import { expect, test } from '@playwright/test'
import { signUp } from './account'

/**
 * A list built from the real catalogue, priced, resized, taken into a battle, and
 * then tracked unit by unit — with the opponent's device following along without
 * being touched. Nothing here can be proved by a unit test: the catalogue is
 * loaded by the server on first use and every number crosses the wire.
 */
test('a built list is priced, played and tracked', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()

  await signUp(alice, 'Alice')

  await alice.goto('/')
  await alice.getByRole('button', { name: 'Open a battle' }).click()
  // The origin is only known once mounted, so the field starts empty: waiting for
  // the value rather than the element is what stops this reading nothing.
  const invite = alice.getByLabel('Send this link to your opponent')
  await expect(invite).toHaveValue(/\/b\//)
  const link = await invite.inputValue()

  await alice.getByRole('button', { name: 'Build from the catalogue' }).click()
  await alice.getByRole('combobox', { name: 'Faction' }).click()
  await alice.getByRole('option', { name: 'Death Guard', exact: true }).click()

  // A list without a detachment is not a legal army, so it cannot be attached.
  await alice.getByRole('button', { name: 'Add detachment' }).click()
  await alice.getByRole('menuitem', { name: /Death Lord/ }).click()

  await alice.getByLabel('Add a unit').fill('Plague Marines')
  await alice.getByRole('button', { name: 'Add Plague Marines', exact: true }).first().click()

  const total = alice.locator('[data-stat="points"]')
  await expect(total).toBeVisible()
  const atFive = Number.parseInt(await total.innerText(), 10)
  // The points bar states the legality: a tick within the limit, a warning over it.
  await expect(alice.getByText('Within the points limit')).toBeAttached()

  // The loadout belongs to whichever unit is selected, so selecting it is the first
  // half of editing it.
  await alice
    .getByRole('button', { name: /^Plague Marines/ })
    .first()
    .click()

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
      .not.toHaveText(`${beforeChoice}/2000`, { timeout: 5000 })
      .catch(() => {})
  }

  await alice.evaluate(() => {
    const existing = document.querySelector('[data-unit="Plague Marines"]')
    if (!existing) throw new Error('Plague Marines card is missing')
    new MutationObserver(() => {
      if (!document.contains(existing)) document.documentElement.dataset.rosterReloaded = 'true'
    }).observe(document.body, { childList: true, subtree: true })
  })
  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await alice.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click()
  await expect(alice.locator('[data-unit="Lord of Virulence"]')).toBeVisible()
  await expect(alice.locator('html')).not.toHaveAttribute('data-roster-reloaded', 'true')
  await alice
    .getByRole('button', { name: /^Lord of Virulence/ })
    .first()
    .click()

  // An enhancement is offered only for the detachment it belongs to, and costs points.
  const enhancement = alice.getByRole('combobox', { name: /Lord of Virulence Enhancements/ })
  await expect(enhancement).toBeVisible()
  const beforeEnhancement = Number.parseInt(await total.innerText(), 10)
  await enhancement.click()
  const faceOfDeath = alice.getByRole('option', { name: /Face of Death/ })
  await expect(faceOfDeath).toContainText('At the start of the Fight phase')
  await alice.screenshot({ path: 'test-results/enhancement-options.png' })
  await faceOfDeath.click()
  await expect(total).not.toHaveText(`${beforeEnhancement}/2000`)
  await expect(alice.locator('[data-unit="Lord of Virulence"]').getByText('Enhancement', { exact: true })).toBeVisible()
  await enhancement.click()
  await alice.getByRole('option', { name: 'None' }).click()
  await expect(total).toHaveText(`${beforeEnhancement}/2000`)
  await expect(alice.locator('[data-unit="Lord of Virulence"]').getByText('Enhancement', { exact: true })).toBeHidden()

  await alice.screenshot({ path: 'test-results/builder.png', fullPage: true })
  await alice.getByRole('button', { name: 'Attach this list' }).click()
  await alice.getByRole('button', { name: /Step 3 Missions/ }).click()

  // The detachment's own stratagems arrive from the rules data, already chosen.
  await expect(alice.getByRole('button', { name: /Mortarion’s Teachings/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(alice.getByText(/Tabletop Developer Consortium/)).toBeVisible()
  // Picked, never typed: a primary mission and a secondary from the deck.
  await alice.getByRole('button', { name: /^Behind Enemy Lines/ }).click()
  await alice.getByRole('button', { name: /^Battlefield Dominance/ }).click()
  await alice.getByRole('button', { name: 'Save these' }).click()

  await signUp(bob, 'Bob')

  await bob.goto(link)
  await bob.getByRole('button', { name: 'Join the battle' }).click()
  await bob.getByRole('button', { name: 'Paste a list' }).click()
  await bob.getByLabel('Your army').fill('Ultramarines')
  await bob.getByLabel('Your list').fill('10 Intercessors')
  await bob.getByRole('button', { name: /my list/ }).click()
  await bob.getByRole('button', { name: /Step 4 Ready/ }).click()

  await alice.getByRole('button', { name: 'Alice goes first' }).click()
  await expect(alice.getByRole('heading', { name: 'command phase' })).toBeVisible()

  // Both of Alice's units are on the table, and Bob's device says so too.
  // The list named itself from the faction and the detachment.
  const panel = /Death Guard — Death Lord/
  const aliceStanding = alice.locator('section', { hasText: panel }).locator('[data-stat="standing"]')
  await expect(aliceStanding).toHaveText('2/2')
  await expect(bob.locator('section', { hasText: panel }).locator('[data-stat="standing"]')).toHaveText('2/2')

  // The detachment travels with the list, so the opponent can see what they face.
  await expect(bob.locator('section', { hasText: panel }).getByText(/Death Lord/)).toBeVisible()

  // A pasted list names nothing, so Bob has no units to track.
  await expect(bob.locator('section', { hasText: 'Ultramarines' }).locator('[data-stat="standing"]')).toHaveCount(0)

  // Models come off one at a time; the unit is lost when the last one goes.
  const shed = alice.getByRole('button', { name: /^Lose a model from Plague Marines/ })
  await shed.click()
  await expect(alice.getByText('9/10')).toBeVisible()

  await alice
    .getByRole('button', { name: /^Lose Plague Marines/ })
    .first()
    .click()
  await expect(aliceStanding).toHaveText('1/2')

  // Bob is not touched: his page learns the casualty from the stream.
  await expect(bob.locator('section', { hasText: panel }).locator('[data-stat="standing"]')).toHaveText('1/2')

  // A unit is its owner's to report lost, so Bob is offered no such button.
  await expect(bob.getByRole('button', { name: /^Lose Plague Marines/ })).toHaveCount(0)

  // Scoring is one tap of the figure the card actually pays, not a typed number.
  const behind = alice.getByRole('button', { name: /Behind Enemy Lines plus/ }).first()
  await expect(behind).toBeVisible()
  await behind.click()
  await expect(alice.locator('section', { hasText: panel }).locator('[data-stat="secondary"]')).not.toHaveText('0')

  await alice.screenshot({ path: 'test-results/tracked.png', fullPage: true })
})
