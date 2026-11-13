import { expect, test, type Page } from './test'
import {
  attachRoster,
  chooseBattlefield,
  createBattle,
  createRoster,
  recordFirstTurn,
  setupStep,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
  expectNoPageOverflow,
  PHONE,
  playerPanel,
} from './account'

// Three accounts and three devices, so it needs more room than a duel. Every army comes
// from one catalogue on purpose: the shared container prices each faction it is shown.
test.setTimeout(120_000)

/**
 * The whole point of the 2v1 layout: the allied pair is one side.
 *
 * They share the turn, the command points, the mission cards and the score, so the
 * tracker draws one of each. Only the armies are separate.
 */
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
  await createBattle(host, { opponent: ally, ally: partner })

  await attachRoster(host, hostRoster)
  await expect(ally.getByText(hostRoster, { exact: true }).first()).toBeVisible()
  await attachRoster(ally, allyRoster)
  await expect(partner.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  await attachRoster(partner, partnerRoster)
  // Setup groups the allies on one side rather than listing three players flat.
  const allied = host.locator('[data-face-off-side="1"]')
  await expect(allied).toContainText(allyName)
  await expect(allied).toContainText(partnerName)
  // The battlefield follows from both sides' dispositions, so the host has to have seen both armies first.
  await expect(host.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  await expect(host.getByText(partnerRoster, { exact: true }).first()).toBeVisible()
  // The pair shares its side's points, which says who is allied.
  await expect(ally.locator('[data-face-off-side="1"]').getByText(/ of 2,000 pts shared/)).toBeVisible()

  // Setting the table is done together, so one device can arrange an army it does not own.
  // Three devices are settling cards at once, so a press that loses that race is pressed again.
  const bonus = (page: Page, action: 'Add' | 'Remove') =>
    page.getByRole('button', { name: new RegExp(`^${action} the battle ready bonus for ${allyName}$`) })
  await expect(async () => {
    if (!(await bonus(ally, 'Add').isVisible())) await bonus(host, 'Remove').click({ timeout: 2_000 })
    await expect(bonus(ally, 'Add')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  await expect(async () => {
    if (!(await bonus(host, 'Remove').isVisible())) await bonus(ally, 'Add').click({ timeout: 2_000 })
    await expect(bonus(host, 'Remove')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  await chooseBattlefield(host)
  await expect(partner.locator('#setup-secondaries')).toHaveAttribute('data-complete', 'true')
  await setupStep(partner, 'Secondaries')
  // Any player at the table can referee either side's secondary choices.
  await expect(partner.getByRole('group', { name: 'Secondary play' })).toHaveCount(2)
  await expect(partner.getByRole('button', { name: /^Fixed/ })).toHaveCount(2)
  await recordFirstTurn(host)
  await host.getByRole('button', { name: 'Start battle' }).click()
  await takeTheTurn(host)
  await expect(host.getByRole('heading', { name: 'command phase' })).toBeVisible()
  await expect(ally.getByRole('heading', { name: 'command phase' })).toBeVisible()

  // One panel for the pair, carrying both armies and a single command point pool.
  await expect(sidePanels(ally)).toHaveCount(2)
  await expect(playerPanel(ally, 1).getByRole('button', { name: `Open ${allyRoster}`, exact: true })).toHaveText('Army')
  await expect(playerPanel(ally, 1).getByRole('button', { name: `Open ${partnerRoster}`, exact: true })).toHaveText('Army')
  await expect(playerPanel(ally, 1).locator('[data-stat="cp"]')).toHaveCount(1)

  // A command point one ally gains is the same one their partner is holding.
  await playerPanel(ally, 1).getByRole('button', { name: '+1 CP' }).click()
  await expect(playerPanel(ally, 1).locator('[data-stat="cp"]')).toHaveText('2')
  await expect(playerPanel(partner, 1).locator('[data-stat="cp"]')).toHaveText('2')
  await expect(playerPanel(host, 1).locator('[data-stat="cp"]')).toHaveText('2')

  // One army between the pair, so one bonus, paid to the side as the battle began.
  await expect(playerPanel(host, 1)).toContainText('Battle ready included')
  await expect(playerPanel(host, 1).locator('[data-stat="vp"]')).toHaveText('10')

  await ally.screenshot({ path: test.info().outputPath('team-battle-tracker.png'), fullPage: true })
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
  const opponent = await (await browser.newContext()).newPage()
  const hostName = uniqueName('Captain')
  const allyName = uniqueName('Partner')

  await signUp(opponent, uniqueName('Rival'))
  const opponentRoster = await createRoster(opponent, { faction: 'Necrons', detachment: /Canoptek Court/, name: 'Opposing army' })
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
  await createBattle(host, { yourAlly: ally, opponent })

  await attachRoster(host, hostRoster)
  await attachRoster(opponent, opponentRoster)
  await attachRoster(ally, allyRoster)
  // The opener and the ally who joined them are one side, named as one.
  await expect(host.locator('[data-face-off-side="0"]')).toContainText(hostName)
  await expect(host.locator('[data-face-off-side="0"]')).toContainText(allyName)
  await expect(ally.getByText(hostRoster, { exact: true }).first()).toBeVisible()
  // The battlefield follows from both sides' dispositions, so the host has to have seen every army first.
  await expect(host.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  // Shared by the pair, which is what says who is allied.
  await expect(host.locator('[data-face-off-side="0"]').getByText(/ of 2,000 pts shared/)).toBeVisible()

  await chooseBattlefield(host)
  await startBattle(host, `${hostName} & ${allyName}`)

  // One pool, holding what each ally brought: the opener's detachment and their ally's.
  const ours = playerPanel(host, 0)
  // Both allies are pictured and named at the top of the one panel they share.
  await expect(ours.getByRole('link', { name: hostName })).toBeVisible()
  await expect(ours.getByRole('link', { name: allyName })).toBeVisible()
  // Each ally's army reads as its own line, not as one sentence holding both of them.
  await expect(ours.getByRole('link', { name: /^Awakened Dynasty$/ })).toBeVisible()
  await expect(ours.getByRole('link', { name: /^Hypercrypt Legion$/ })).toBeVisible()
  // The format is the shape of the table rather than who is in it.
  await expect(host.getByRole('main')).toContainText('2v1')
  await expect(ours.getByRole('button', { name: /^About Protocol of the Eternal Revenant$/i })).toBeVisible()
  await expect(ours.getByRole('button', { name: /^About Reanimation Crypts$/i })).toBeVisible()
  // The side across the table keeps its own, which is what says the pool is per side.
  await expect(playerPanel(host, 1).getByRole('button', { name: /^About Reanimation Crypts$/i })).toHaveCount(0)
  await expect(sidePanels(host)).toHaveCount(2)

  await host.screenshot({ path: test.info().outputPath('team-battle-allied-opener.png'), fullPage: true })
  // A phone holds one column, which is where a pair of players had least room.
  await host.setViewportSize(PHONE)
  await expect(ours.getByRole('link', { name: hostName })).toBeVisible()
  await expect(ours.getByRole('link', { name: allyName })).toBeVisible()
  await host.screenshot({ path: test.info().outputPath('team-battle-allied-opener-phone.png'), fullPage: true })
})

test('a manual 2v2 seats two armies on each side with one shared pool', async ({ browser, page: host }) => {
  test.setTimeout(240_000)
  const names = ['Doubles captain', 'Doubles teammate', 'Doubles opponent', 'Doubles opponent teammate'].map(uniqueName)
  const rosters = ['Captain army', 'Teammate army', 'Opponent army', 'Opponent teammate army']
  const pages = [host]
  await signUp(host, names[0])
  await createRoster(host, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: rosters[0], size: /Incursion/ })
  for (let index = 1; index < 4; index++) {
    const participant = await (await browser.newContext()).newPage()
    pages.push(participant)
    await signUp(participant, names[index])
    await createRoster(participant, {
      faction: 'Necrons',
      detachment: /Awakened Dynasty/,
      name: rosters[index],
      size: /Incursion/,
    })
  }
  await createBattle(host, { opponent: pages[2], yourAlly: pages[1], secondOpponent: pages[3] })
  for (const [index, page] of pages.entries()) await attachRoster(page, rosters[index])
  await chooseBattlefield(host)
  await startBattle(host, `${names[0]} & ${names[1]}`)

  await expect(sidePanels(host)).toHaveCount(2)
  for (const [index, roster] of rosters.entries()) {
    await expect(playerPanel(host, index < 2 ? 0 : 1).getByRole('button', { name: `Open ${roster}`, exact: true })).toHaveText('Army')
  }
  await expect(playerPanel(host, 0).locator('[data-stat="cp"]')).toHaveCount(1)
  await expect(playerPanel(host, 1).locator('[data-stat="cp"]')).toHaveCount(1)

  await host.setViewportSize(PHONE)
  await expectNoPageOverflow(host)
})

const sidePanels = (page: Page) => page.locator('[data-panel="player"]')
