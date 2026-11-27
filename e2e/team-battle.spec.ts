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
test('a 2v1 draws the allied pair as one side with one pool, whichever side opens it', async ({ browser }) => {
  test.setTimeout(240_000)
  const host = await (await browser.newContext()).newPage()
  const ally = await (await browser.newContext()).newPage()
  const partner = await (await browser.newContext()).newPage()
  const hostName = uniqueName('Solo')
  const allyName = uniqueName('Ally')
  const partnerName = uniqueName('Partner')

  await signUp(ally, allyName)
  const allyRoster = await createRoster(ally, {
    faction: 'Necrons',
    detachment: /Canoptek Court/,
    name: 'Ally army',
    size: /Incursion/,
  })
  await signUp(partner, partnerName)
  const partnerRoster = await createRoster(partner, {
    faction: 'Necrons',
    detachment: /Hypercrypt Legion/,
    name: 'Partner army',
    size: /Incursion/,
  })
  await signUp(host, hostName)
  const hostRoster = await createRoster(host, { faction: 'Necrons', detachment: /Canoptek Court/, name: 'Host army' })
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
  await expect(playerPanel(ally, 1).getByRole('button', { name: `Units: ${allyRoster}`, exact: true })).toHaveText('Units')
  await expect(playerPanel(ally, 1).getByRole('button', { name: `Units: ${partnerRoster}`, exact: true })).toHaveText('Units')
  await expect(playerPanel(ally, 1).locator('[data-stat="cp"]')).toHaveCount(1)

  // A command point one ally gains is the same one their partner is holding.
  await playerPanel(ally, 1).getByRole('button', { name: '+1 CP' }).click()
  await expect(playerPanel(ally, 1).locator('[data-stat="cp"]')).toHaveText('2')
  await expect(playerPanel(partner, 1).locator('[data-stat="cp"]')).toHaveText('2')
  await expect(playerPanel(host, 1).locator('[data-stat="cp"]')).toHaveText('2')

  // One army between the pair, so one bonus, paid to the side as the battle began.
  await expect(host.locator('[data-side-score="1"] [data-stat="vp"]')).toHaveText('10')

  await ally.screenshot({ path: test.info().outputPath('team-battle-tracker.png'), fullPage: true })

  // An ally opens the next battle beside their partner, against the same player: the opener keeps the first seat — deleting
  // the battle is theirs — and the side plays both allies' detachments out of one pool.
  await createBattle(ally, { yourAlly: partner, opponent: host })

  await attachRoster(ally, allyRoster)
  await attachRoster(host, hostRoster)
  await attachRoster(partner, partnerRoster)
  // The opener and the partner who joined them are one side, named as one.
  await expect(ally.locator('[data-face-off-side="0"]')).toContainText(allyName)
  await expect(ally.locator('[data-face-off-side="0"]')).toContainText(partnerName)
  await expect(partner.getByText(allyRoster, { exact: true }).first()).toBeVisible()
  // The battlefield follows from both sides' dispositions, so the opener has to have seen every army first.
  await expect(ally.getByText(partnerRoster, { exact: true }).first()).toBeVisible()
  // Shared by the pair, which is what says who is allied.
  await expect(ally.locator('[data-face-off-side="0"]').getByText(/ of 2,000 pts shared/)).toBeVisible()

  await chooseBattlefield(ally)
  await startBattle(ally, `${allyName} & ${partnerName}`)

  // One pool, holding what each ally brought: the opener's detachment and their partner's.
  const ours = playerPanel(ally, 0)
  // Both allies are pictured and named at the top of the one panel they share.
  await expect(ours.getByRole('link', { name: allyName })).toBeVisible()
  await expect(ours.getByRole('link', { name: partnerName })).toBeVisible()
  // Each ally's army reads as its own line, not as one sentence holding both of them.
  await expect(ours.getByRole('link', { name: /^Awakened Dynasty$/ })).toBeVisible()
  await expect(ours.getByRole('link', { name: /^Hypercrypt Legion$/ })).toBeVisible()
  // The format is the shape of the table rather than who is in it.
  await expect(ally.getByRole('main')).toContainText('2v1')
  await expect(ours.getByRole('button', { name: /^About Protocol of the Eternal Revenant$/i })).toBeVisible()
  await expect(ours.getByRole('button', { name: /^About Reanimation Crypts$/i })).toBeVisible()
  // The side across the table keeps its own, which is what says the pool is per side.
  await expect(playerPanel(ally, 1).getByRole('button', { name: /^About Reanimation Crypts$/i })).toHaveCount(0)
  await expect(sidePanels(ally)).toHaveCount(2)

  await ally.screenshot({ path: test.info().outputPath('team-battle-allied-opener.png'), fullPage: true })
  // A phone holds one column, which is where a pair of players had least room.
  await ally.setViewportSize(PHONE)
  await expect(ours.getByRole('link', { name: allyName })).toBeVisible()
  await expect(ours.getByRole('link', { name: partnerName })).toBeVisible()
  await ally.screenshot({ path: test.info().outputPath('team-battle-allied-opener-phone.png'), fullPage: true })
})

const sidePanels = (page: Page) => page.locator('[data-panel="player"]')
