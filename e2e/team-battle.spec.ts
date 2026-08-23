import { expect, test, type Page } from '@playwright/test'
import {
  attachRoster,
  befriend,
  chooseBattlefield,
  createBattle,
  createRoster,
  PRACTICE_OPPONENT,
  recordFirstTurn,
  setupStep,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
} from './account'

/**
 * The whole point of the 2v1 layout: the allied pair is one side.
 *
 * They share the turn, the command points, the mission cards and the score, so the
 * tracker draws one of each. Only the armies are separate.
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
  await expect(ally.getByText(hostRoster, { exact: true }).first()).toBeVisible()
  await attachRoster(ally, allyRoster)
  await expect(partner.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  await attachRoster(partner, partnerRoster)
  // Setup groups the allies under one heading rather than listing three players flat.
  const alliedNames = host.locator('[data-players]').filter({ hasText: allyName }).first()
  await expect(alliedNames).toContainText(partnerName)
  // The battlefield follows from both sides' dispositions, so the host has to have seen both armies first.
  await expect(host.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  await expect(host.getByText(partnerRoster, { exact: true }).first()).toBeVisible()
  // Only the allied side splits the points, so only an ally is told about it.
  await expect(ally.getByText(/splits 2000 points evenly, so each ally brings a 1000-point army/)).toBeVisible()
  await expect(host.getByText(/splits 2000 points evenly/)).toHaveCount(0)

  // Setting the table is done together, so one device can arrange an army it does not own.
  await host.getByRole('button', { name: new RegExp(`^Remove the battle ready bonus for ${allyName}$`) }).click()
  await expect(ally.getByRole('button', { name: new RegExp(`^Add the battle ready bonus for ${allyName}$`) })).toBeVisible()
  await ally.getByRole('button', { name: new RegExp(`^Add the battle ready bonus for ${allyName}$`) }).click()
  await expect(host.getByRole('button', { name: new RegExp(`^Remove the battle ready bonus for ${allyName}$`) })).toBeVisible()
  await chooseBattlefield(host)
  await setupStep(host, 'Secondaries')
  // One seat writes the side's cards. The other is told so, rather than racing it with its own.
  await expect(partner.getByText(new RegExp(`${allyName} sets the cards and stratagems your side plays`))).toBeVisible()
  await expect(partner.getByRole('group', { name: 'Secondary play' })).toHaveCount(0)
  await recordFirstTurn(host)
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
  await side(ally, 1).getByRole('button', { name: '+1 CP' }).click()
  await expect(side(ally, 1).locator('[data-stat="cp"]')).toHaveText('1')
  await expect(side(partner, 1).locator('[data-stat="cp"]')).toHaveText('1')
  await expect(side(host, 1).locator('[data-stat="cp"]')).toHaveText('1')

  // One army between the pair, so one bonus, promised now and paid when the battle ends.
  await expect(side(host, 1)).toContainText('+10 battle ready at the end')
  await expect(side(host, 1).locator('[data-stat="vp"]')).toHaveText('0')

  await ally.screenshot({ path: 'test-results/team-battle-tracker.png', fullPage: true })
})

/**
 * The same 2v1, opened by one of the allied pair rather than by the player facing it.
 *
 * The opener keeps the first seat — deleting the battle is theirs — but the pair is
 * now their own side, and the side plays both allies' detachments out of one pool.
 */
test('a 2v1 opened from the allied side seats its opener with their ally and plays both detachments', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  const ally = await (await browser.newContext()).newPage()
  const hostName = uniqueName('Captain')
  const allyName = uniqueName('Partner')

  await signUp(ally, allyName)
  const allyRoster = await createRoster(ally, {
    faction: 'Necrons',
    detachment: /Hypercrypt Legion/,
    name: 'Ally army',
    size: /Incursion/,
  })
  await signUp(host, hostName)
  const hostRoster = await createRoster(host, {
    faction: 'Necrons',
    detachment: /Awakened Dynasty/,
    name: 'Host army',
    size: /Incursion/,
  })
  // The seat nobody signs in to is fielded from this table's own library.
  const practiceRoster = await createRoster(host, { faction: 'Necrons', detachment: /Canoptek Court/, name: 'Practice army' })
  await befriend(host, ally)

  const url = await createBattle(host, { yourAlly: allyName, practice: true })
  await ally.goto(url)

  await attachRoster(host, hostRoster)
  await attachRoster(host, practiceRoster, { forPlayer: PRACTICE_OPPONENT })
  await attachRoster(ally, allyRoster)
  // The opener and the ally they chose are one side, named as one.
  await expect(host.locator('[data-players]').filter({ hasText: hostName }).first()).toContainText(allyName)
  await expect(ally.getByText(hostRoster, { exact: true }).first()).toBeVisible()
  // The battlefield follows from both sides' dispositions, so the host has to have seen every army first.
  await expect(host.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  // Halved for the pair and whole for the side facing them, which is what says who is allied.
  await expect(host.getByText(/splits 2000 points evenly, so each ally brings a 1000-point army/)).toBeVisible()

  await chooseBattlefield(host)
  await startBattle(host, `${hostName} & ${allyName}`)

  // One pool, holding what each ally brought: the opener's detachment and their ally's.
  const ours = side(host, 0)
  // Both allies are pictured and named at the top of the one panel they share.
  await expect(ours.getByRole('link', { name: hostName })).toBeVisible()
  await expect(ours.getByRole('link', { name: allyName })).toBeVisible()
  // Each ally's army reads as its own line, not as one sentence holding both of them.
  await expect(ours.getByRole('link', { name: /^Awakened Dynasty$/ })).toBeVisible()
  await expect(ours.getByRole('link', { name: /^Hypercrypt Legion$/ })).toBeVisible()
  // A seat nobody signs in to is named after what it is. Nothing badges it a second
  // time, and the format is the shape of the table rather than who is in it.
  await expect(host.getByRole('main').getByText('practice', { exact: true })).toHaveCount(0)
  await expect(host.getByRole('main')).toContainText('2v1')
  await expect(ours.getByRole('button', { name: /^About Protocol of the Eternal Revenant$/i })).toBeVisible()
  await expect(ours.getByRole('button', { name: /^About Reanimation Crypts$/i })).toBeVisible()
  // The side across the table keeps its own, which is what says the pool is per side.
  await expect(side(host, 1).getByRole('button', { name: /^About Reanimation Crypts$/i })).toHaveCount(0)
  await expect(sidePanels(host)).toHaveCount(2)

  await host.screenshot({ path: 'test-results/team-battle-allied-opener.png', fullPage: true })
  // A phone holds one column, which is where a pair of players had least room.
  await host.setViewportSize({ width: 390, height: 844 })
  await expect(ours.getByRole('link', { name: hostName })).toBeVisible()
  await expect(ours.getByRole('link', { name: allyName })).toBeVisible()
  await host.screenshot({ path: 'test-results/team-battle-allied-opener-phone.png', fullPage: true })
})

const sidePanels = (page: Page) => page.locator('[data-panel="player"]')
const side = (page: Page, index: number) => page.locator(`[data-panel="player"][data-side="${index}"]`)
