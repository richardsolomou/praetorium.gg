import { expect, test, type Page } from '@playwright/test'
import {
  attachRoster,
  befriend,
  createBattle,
  createRoster,
  setupBattle,
  setupStep,
  signUp,
  startBattle,
  uniqueName,
  waitForRosterSave,
} from './account'

test('stratagems and tactical missions are tracked through a turn', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  await alice.getByLabel('Add a unit').fill('Lord of Virulence')
  await waitForRosterSave(alice, () => alice.getByRole('button', { name: 'Add Lord of Virulence', exact: true }).first().click())
  await setupBattle(alice, bob, { opponent: bobName, hostRoster: aliceRoster, guestRoster: bobRoster })

  await drawSecondary(alice, 'Behind Enemy Lines', 'behind-enemy-lines')
  await drawSecondary(alice, 'Assassination', 'assassination')

  await alice.getByRole('button', { name: 'Select secret mission' }).click()
  await alice.getByRole('dialog', { name: 'Select a secret mission' }).getByRole('button', { name: 'Bring It Down', exact: true }).click()
  await expect(alice.locator('[data-secondary="bring-it-down"]')).toContainText('Bring It Down')
  await expect(bob.locator('[data-secondary="secret"]')).toContainText('Secret mission')
  await expect(
    bob.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).getByText('Bring It Down', { exact: true }),
  ).toHaveCount(0)
  await alice.getByRole('button', { name: 'Reveal' }).click()
  await expect(bob.locator('[data-secondary="bring-it-down"]')).toContainText('Bring It Down')

  const panel = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' })
  const cp = panel.locator('[data-stat="cp"]')
  await expect(cp).toHaveText('1')
  await expect(bob.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).getByRole('button', { name: /^Use / })).toHaveCount(
    0,
  )

  await alice.getByRole('button', { name: 'Behind Enemy Lines plus 3 per friendly unit wholly within opponent deployment zone' }).click()
  await expect(panel.locator('[data-stat="secondary"]')).toHaveText('3')
  await expect(panel.locator('[data-secondary="behind-enemy-lines"]')).toContainText('T1 3')
  await expect(bob.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).locator('[data-stat="secondary"]')).toHaveText('3')

  await alice.locator('[data-secondary="behind-enemy-lines"]').getByRole('button', { name: 'Discard' }).click()
  await expect(bob.getByText('discarded', { exact: true })).toBeVisible()
  await alice.locator('[data-secondary="assassination"]').getByRole('button', { name: 'Discard' }).click()
  await expect(alice.getByText('Draw a replacement')).toBeVisible()
  await drawSecondary(alice, 'A Grievous Blow', 'a-grievous-blow')
  await expect(bob.locator('[data-secondary="a-grievous-blow"]')).toContainText('A Grievous Blow')

  await expect(alice.getByText(new RegExp(`${aliceName} brought Death Guard`))).toBeVisible()
  await expect(alice.getByText(/The battlefield is /)).toBeVisible()
  await expect(alice.getByText(/marks Behind Enemy Lines discarded/)).toBeVisible()
  await expect(alice.getByText(/draws A Grievous Blow/)).toBeVisible()
  await alice.screenshot({ path: 'test-results/battle.png', fullPage: true })
})

test('a tactical player is asked to draw at the top of their command phase', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')

  await signUp(bob, bobName)
  const bobRoster = await createRoster(bob, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Necrons' })
  await signUp(alice, aliceName)
  const aliceRoster = await createRoster(alice, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Death Guard' })
  // Tactical is the default, so nothing is chosen up front and the deck is the only source.
  await befriend(alice, bob)
  const url = await createBattle(alice, { opponent: bobName })
  await bob.goto(url)
  await attachRoster(alice, aliceRoster)
  await setupStep(bob, 'Armies')
  await attachRoster(bob, bobRoster)
  await expect(alice.getByText(bobRoster, { exact: true }).first()).toBeVisible()
  await startBattle(alice)

  // The prompt is the point: it stands open in the panel rather than waiting to be found.
  const prompt = alice.locator('[data-panel="player"]').filter({ hasText: 'Death Guard' }).getByText('Draw a mission')
  await expect(prompt).toBeVisible()
  await drawSecondary(alice, 'A Grievous Blow', 'a-grievous-blow')
  await drawSecondary(alice, 'Beacon', 'beacon')
  // Two in hand is a full hand, so it stops asking.
  await expect(prompt).toBeHidden()
  await expect(alice.locator('[data-secondary="a-grievous-blow"]')).toContainText('A Grievous Blow')
  await expect(bob.locator('[data-secondary="a-grievous-blow"]')).toContainText('A Grievous Blow')
})

/** A tactical hand starts empty, so a named card has to be taken from the deck the draw prompt opens. */
async function drawSecondary(page: Page, name: string, key: string) {
  await page.getByRole('button', { name: 'Choose a card' }).click()
  await page.getByRole('dialog', { name: 'Draw a secondary mission' }).getByRole('button', { name, exact: true }).click()
  await expect(page.locator(`[data-secondary="${key}"]`)).toContainText(name)
}
