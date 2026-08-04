import { expect, test } from '@playwright/test'

/**
 * Stratagems and mission scoring, played out.
 *
 * Nothing here is typed. A detachment brings its own stratagems, the mission cards
 * are picked from the deck, and scoring is one tap of the figure a card actually
 * pays. Only a built list can offer any of it: knowing the stratagems means knowing
 * the detachment.
 */
test('stratagems and mission cards are tracked through a turn', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()

  await alice.goto('/')
  await alice.getByLabel('Your name').fill('Alice')
  await alice.getByRole('button', { name: 'Open a battle' }).click()
  const link = await alice.getByLabel('Send this link to your opponent').inputValue()

  await alice.getByRole('button', { name: 'Build from the catalogue' }).click()
  await alice.getByRole('combobox', { name: 'Army' }).click()
  await alice.getByRole('option', { name: 'Chaos - Death Guard' }).click()
  await alice.getByRole('combobox', { name: 'Detachment' }).click()
  await alice.getByRole('option', { name: /Death Lord/ }).click()
  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await alice
    .getByRole('button', { name: /^Lord of Virulence/ })
    .first()
    .click()
  await alice.getByRole('button', { name: 'Attach this list' }).click()
  await expect(alice.getByRole('button', { name: 'Replace my list' })).toBeVisible()

  // The detachment's six arrive already chosen; a mission card is one tap.
  await expect(alice.getByRole('button', { name: /Undying Spite/ })).toHaveAttribute('aria-pressed', 'true')
  await alice.getByRole('button', { name: /^Behind Enemy Lines/ }).click()
  await alice.getByRole('button', { name: 'Save these' }).click()

  await bob.goto(link)
  await bob.getByLabel('Your name').fill('Bob')
  await bob.getByRole('button', { name: 'Join the battle' }).click()
  await bob.getByRole('button', { name: 'Paste a list' }).click()
  await bob.getByLabel('Your army').fill('Ultramarines')
  await bob.getByLabel('Your list').fill('10 Intercessors')
  await bob.getByRole('button', { name: /my list/ }).click()

  await alice.getByRole('button', { name: 'Alice goes first' }).click()
  await expect(alice.getByRole('heading', { name: 'command phase' })).toBeVisible()

  const panel = /Death Guard — Death Lord/
  const cp = alice.locator('section', { hasText: panel }).locator('[data-stat="cp"]')
  await expect(cp).toHaveText('1')

  // A stratagem costs what the dataset says it costs, off its owner's pool only.
  await alice.getByRole('button', { name: /^Use / }).first().click()
  await expect(cp).toHaveText('0')

  // Bob can read them but is offered no button for someone else's army.
  await expect(bob.getByRole('button', { name: /^Use / })).toHaveCount(0)

  // Scoring is the card's own figure, not a number anybody typed.
  await alice
    .getByRole('button', { name: /Behind Enemy Lines plus/ })
    .first()
    .click()
  await expect(alice.locator('section', { hasText: panel }).locator('[data-stat="secondary"]')).not.toHaveText('0')

  // And the opponent's device follows without being touched.
  await expect(bob.locator('section', { hasText: panel }).locator('[data-stat="secondary"]')).not.toHaveText('0')

  await alice.screenshot({ path: 'test-results/battle.png', fullPage: true })
})
