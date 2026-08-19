import { expect, test, type Page } from '@playwright/test'
import {
  attachRoster,
  befriend,
  chooseBattlefield,
  createBattle,
  createRoster,
  setupStep,
  signUp,
  takeTheTurn,
  uniqueName,
} from './account'

/**
 * The whole point of the 2v1 layout: the allied pair is one side.
 *
 * They share the turn, the command points, the mission cards and the score, so the
 * tracker draws one of each. Only the armies are separate, and only their own player
 * may change one.
 */
// Three accounts and three devices, so it needs more room than a duel. Every army comes
// from one catalogue on purpose: the shared container prices each faction it is shown.
test.setTimeout(120_000)

test('a 2v1 draws the allied pair as one side with one pool of everything', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  const ally = await (await browser.newContext()).newPage()
  const partner = await (await browser.newContext()).newPage()
  const hostName = uniqueName('Solo')
  const allyName = uniqueName('Ally')
  const partnerName = uniqueName('Partner')

  await signUp(ally, allyName)
  const allyRoster = await createRoster(ally, {
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    name: 'Ally army',
    size: /Incursion/,
  })
  await signUp(partner, partnerName)
  const partnerRoster = await createRoster(partner, {
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    name: 'Partner army',
    size: /Incursion/,
  })
  await signUp(host, hostName)
  const hostRoster = await createRoster(host, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Host army' })
  await befriend(host, ally)
  await befriend(host, partner)

  const url = await createBattle(host, { opponent: allyName, ally: partnerName })
  await ally.goto(url)
  await partner.goto(url)

  await attachRoster(host, hostRoster)
  await attachRoster(ally, allyRoster)
  await attachRoster(partner, partnerRoster)
  // Setup groups the allies under one heading rather than listing three players flat.
  await expect(host.getByRole('main')).toContainText(`${allyName} & ${partnerName}`)
  // The battlefield follows from both sides' dispositions, so the host has to have seen both armies first.
  await expect(host.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  await expect(host.getByText(partnerRoster, { exact: true }).first()).toBeVisible()
  // Only the allied side splits the points, so only an ally is told about it.
  await expect(ally.getByText(/splits 2000 points evenly, so each ally brings a 1000-point army/)).toBeVisible()
  await expect(host.getByText(/splits 2000 points evenly/)).toHaveCount(0)

  await chooseBattlefield(host)
  await setupStep(host, 'Pre-battle')
  // One seat writes the side's cards. The other is told so, rather than racing it with its own.
  await expect(partner.getByText(new RegExp(`${allyName} sets the cards and stratagems your side plays`))).toBeVisible()
  await expect(partner.getByRole('group', { name: 'Secondary play' })).toHaveCount(0)
  // Setting the table is done together, so one device can arrange an army it does not own.
  await host.getByRole('button', { name: new RegExp(`^Add the battle ready bonus for ${allyRoster}$`) }).click()
  await expect(ally.getByRole('button', { name: new RegExp(`^Remove the battle ready bonus for ${allyRoster}$`) })).toBeVisible()
  await setupStep(host, 'First turn')
  await host.getByRole('button', { name: 'Start battle' }).click()
  await takeTheTurn(host)
  await expect(host.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await expect(ally.getByRole('heading', { name: 'command phase' })).toBeVisible()

  // One panel for the pair, carrying both armies and a single command point pool.
  await expect(sidePanels(ally)).toHaveCount(2)
  await expect(side(ally, 1)).toContainText(allyRoster)
  await expect(side(ally, 1)).toContainText(partnerRoster)
  await expect(side(ally, 1).locator('[data-stat="cp"]')).toHaveCount(1)

  // A command point one ally gains is the same one their partner is holding.
  await ally.getByRole('button', { name: '+1 CP' }).click()
  await expect(side(ally, 1).locator('[data-stat="cp"]')).toHaveText('1')
  await expect(side(partner, 1).locator('[data-stat="cp"]')).toHaveText('1')
  await expect(side(host, 1).locator('[data-stat="cp"]')).toHaveText('1')

  // The bonus each ally brings is promised now and paid when the battle ends.
  await expect(side(host, 1)).toContainText('+10 battle ready at the end')
  await expect(side(host, 1).locator('[data-stat="vp"]')).toHaveText('0')

  await ally.screenshot({ path: 'test-results/team-battle-tracker.png', fullPage: true })
})

const sidePanels = (page: Page) => page.locator('[data-panel="player"]')
const side = (page: Page, index: number) => page.locator(`[data-panel="player"][data-side="${index}"]`)
