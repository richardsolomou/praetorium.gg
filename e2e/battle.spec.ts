import { expect, test } from '@playwright/test'

/**
 * Stratagems and secondaries, played out. Neither is in the community data, so the
 * player writes them down once and the app enforces what follows: the cost comes
 * off the right pool, a once-per-turn stratagem cannot go twice, and each secondary
 * is scored on its own.
 */
test('stratagems and secondaries are tracked through a turn', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()

  await alice.goto('/')
  await alice.getByLabel('Your name').fill('Alice')
  await alice.getByRole('button', { name: 'Open a battle' }).click()
  const link = await alice.getByLabel('Send this link to your opponent').inputValue()

  await alice.getByRole('button', { name: 'Paste a list' }).click()
  await alice.getByLabel('Your army').fill('Ultramarines')
  await alice.getByLabel('Your list').fill('10 Intercessors')
  await alice.getByRole('button', { name: /my list/ }).click()

  // Written down once, at muster.
  await alice.getByRole('button', { name: 'Add' }).first().click()
  await alice.getByLabel('Stratagem 1 name').fill('Grenade')
  await alice.getByLabel('Stratagem 1 command points').fill('1')
  await alice.getByRole('button', { name: 'Add' }).last().click()
  await alice.getByLabel('Secondary 1 name').fill('Behind Enemy Lines')
  await alice.getByRole('button', { name: 'Save these' }).click()

  await bob.goto(link)
  await bob.getByLabel('Your name').fill('Bob')
  await bob.getByRole('button', { name: 'Join the battle' }).click()
  await bob.getByRole('button', { name: 'Paste a list' }).click()
  await bob.getByLabel('Your army').fill('Death Guard')
  await bob.getByLabel('Your list').fill('10 Plague Marines')
  await bob.getByRole('button', { name: /my list/ }).click()

  await alice.getByRole('button', { name: 'Alice goes first' }).click()
  await expect(alice.getByRole('heading', { name: 'command phase' })).toBeVisible()

  // One command point from the command phase, spent on the stratagem.
  const cp = alice.locator('section', { hasText: 'Ultramarines' }).locator('[data-stat="cp"]')
  await expect(cp).toHaveText('1')
  await alice.getByRole('button', { name: 'Use Grenade' }).click()
  await expect(cp).toHaveText('0')

  // Once per turn means once: the button is offered again only next turn.
  await expect(alice.getByRole('button', { name: 'Use Grenade' })).toBeDisabled()

  // Bob sees the stratagem list but is offered no button for someone else's.
  await expect(bob.getByText('Grenade')).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Use Grenade' })).toHaveCount(0)

  await alice.getByRole('button', { name: 'Behind Enemy Lines plus 5' }).click()
  await expect(alice.locator('section', { hasText: 'Ultramarines' }).locator('[data-stat="secondary"]')).toHaveText('5')

  // The breakdown reaches the opponent's device untouched.
  await expect(bob.locator('section', { hasText: 'Ultramarines' }).locator('[data-stat="secondary"]')).toHaveText('5')

  await alice.screenshot({ path: 'test-results/battle.png', fullPage: true })
})
