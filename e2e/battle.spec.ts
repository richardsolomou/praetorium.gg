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
  // The origin is only known once mounted, so the field starts empty: waiting for
  // the value rather than the element is what stops this reading nothing.
  const invite = alice.getByLabel('Send this link to your opponent')
  await expect(invite).toHaveValue(/\/b\//)
  const link = await invite.inputValue()

  await alice.getByRole('button', { name: 'Build from the catalogue' }).click()
  await alice.getByRole('combobox', { name: 'Faction' }).click()
  await alice.getByRole('option', { name: 'Chaos - Death Guard' }).click()
  await alice.getByRole('button', { name: 'Detachments' }).click()
  await alice.getByRole('menuitemcheckbox', { name: /Death Lord/ }).click()
  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await alice.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click()
  await alice.getByRole('button', { name: 'Attach this list' }).click()

  // The battlefield is drawn, not described, and the army goes onto it.
  await alice.getByRole('button', { name: 'Tipping Point' }).click()
  await alice.getByRole('button', { name: /Step 2 Battlefield/ }).click()
  await expect(alice.getByLabel(/Tipping Point deployment zones/)).toBeVisible()
  const deployment = alice.locator('section').filter({ hasText: /Deploy your army/ })
  await deployment.getByRole('button', { name: 'Lord of Virulence' }).click()
  await alice.getByRole('button', { name: /Step 3 Missions/ }).click()

  // The detachment's six arrive already chosen; a mission card is one tap.
  await expect(alice.getByRole('button', { name: /Undying Spite/ })).toHaveAttribute('aria-pressed', 'true')
  await alice.getByRole('button', { name: 'Tactical' }).click()
  await alice.getByRole('button', { name: /^Behind Enemy Lines/ }).click()
  await alice.getByRole('button', { name: 'Save these' }).click()

  await alice.screenshot({ path: 'test-results/praetorium.png', fullPage: true })

  await bob.goto(link)
  await bob.getByLabel('Your name').fill('Bob')
  await bob.getByRole('button', { name: 'Join the battle' }).click()
  await bob.getByRole('button', { name: 'Paste a list' }).click()
  await bob.getByLabel('Your army').fill('Ultramarines')
  await bob.getByLabel('Your list').fill('10 Intercessors')
  await bob.getByRole('button', { name: /my list/ }).click()
  await bob.getByRole('button', { name: /Step 4 Ready/ }).click()

  await alice.getByRole('button', { name: 'Alice goes first' }).click()
  await expect(alice.getByRole('heading', { name: 'command phase' })).toBeVisible()

  await alice.getByText('Select secret mission').click()
  await alice.getByRole('button', { name: 'Assassination', exact: true }).click()
  await expect(alice.locator('[data-secondary="assassination"]')).toContainText('Assassination')
  await expect(bob.locator('[data-secondary="secret"]')).toContainText('Secret mission')
  await expect(bob.getByText('Assassination', { exact: true })).toHaveCount(0)
  await alice.getByRole('button', { name: 'Reveal' }).click()
  await expect(bob.locator('[data-secondary="assassination"]')).toContainText('Assassination')

  const panel = /Death Guard — Death Lord/
  // Deployed at praetorium, so it is on the table rather than in reserve.
  await expect(alice.locator('section', { hasText: panel }).locator('[data-stat="standing"]')).toHaveText('1/1')
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

  await alice.locator('[data-secondary="behind-enemy-lines"]').getByRole('button', { name: 'Discard' }).click()
  await expect(alice.getByText('discarded', { exact: true })).toBeVisible()
  await expect(bob.getByText('discarded', { exact: true })).toBeVisible()
  await alice.getByText('Draw a replacement').click()
  await alice.getByRole('button', { name: 'Bring It Down', exact: true }).click()
  await expect(bob.locator('[data-secondary="bring-it-down"]')).toContainText('Bring It Down')

  // The account of the battle is read back out of the log, on demand.
  await alice.getByText('How the battle went').click()
  await expect(alice.getByText(/Alice brought Death Guard/)).toBeVisible()
  await expect(alice.getByText(/uses .* for 1 CP/)).toBeVisible()
  await expect(alice.getByText('The battlefield is Tipping Point')).toBeVisible()
  await expect(alice.getByText(/marks Behind Enemy Lines discarded/)).toBeVisible()
  await expect(alice.getByText(/draws Bring It Down/)).toBeVisible()

  await alice.screenshot({ path: 'test-results/battle.png', fullPage: true })
})
