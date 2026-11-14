import { expect, test } from './test'
import {
  attachRoster,
  chooseTracking,
  createRoster,
  followLink,
  joinBattle,
  newBattle,
  playBothSides,
  shareBattleLink,
  signUp,
  uniqueName,
} from './account'

test('a draft battle fills through its link and leaves the drafts once every army is in', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  const opponent = await (await browser.newContext()).newPage()
  const opponentName = uniqueName('Draft opponent')
  await signUp(opponent, opponentName)
  const opponentRoster = await createRoster(opponent, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Joining army' })
  await signUp(host, uniqueName('Draft host'))
  const hostRoster = await createRoster(host, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Drafting army' })

  const url = await newBattle(host)
  const path = new URL(url).pathname
  const draft = host.getByRole('heading', { name: /^Set up the battle/ }).getByText('Draft', { exact: true })
  await expect(draft).toBeVisible()
  // Guided is chosen from the start, so the Opponent step is open without answering Tracking.
  await expect(
    host.locator('#setup-format').getByRole('group', { name: 'How you track it' }).getByRole('button', { pressed: true }),
  ).toHaveText(/^Guided/)
  await expect(host.locator('#setup-opponent')).toHaveAttribute('data-locked', 'false')
  await chooseTracking(host)
  // Without friends, the opponent comes through a link, or the host plays both sides.
  await expect(host.locator('#setup-opponent').getByRole('group', { name: 'How they join' }).getByRole('button')).toHaveText([
    /^Share a link/,
    /^Play both sides/,
  ])
  await attachRoster(host, hostRoster)

  // A draft with an army is offered back from the battles page, and stays out of the battles in progress.
  await host.goto('/battles')
  const resume = host.locator('[data-draft-resume]')
  await expect(resume).toHaveAttribute('href', path)
  await expect(host.locator(`[data-battle-shelf="In progress"] a[href="${path}"]`)).toHaveCount(0)
  await followLink(resume, url)

  await joinBattle(opponent, await shareBattleLink(host), 1)
  // Joining adds no command, so the host's page has to notice it before the opponent does anything else.
  await expect(host.locator('[data-face-off-side="1"]')).toContainText(opponentName)
  await attachRoster(opponent, opponentRoster)
  await expect(host.locator('[data-face-off-side="1"]').getByText(opponentRoster, { exact: true })).toBeVisible()
  await expect(draft).toHaveCount(0)

  await host.goto('/battles')
  await expect(host.locator(`[data-battle-shelf="In progress"] a[href="${path}"]`).first()).toBeVisible()
  await expect(host.locator('[data-draft-resume]')).toHaveCount(0)
})

test('a place you play goes back to the link after its army is chosen, and a draft is deleted from its row', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  await signUp(host, uniqueName('Played host'))
  const roster = await createRoster(host, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Both armies' })
  await newBattle(host)
  const draft = host.getByRole('heading', { name: /^Set up the battle/ }).getByText('Draft', { exact: true })
  await chooseTracking(host)
  await playBothSides(host)
  await attachRoster(host, roster, { side: 0 })
  await attachRoster(host, roster, { side: 1 })
  await expect(draft).toHaveCount(0)

  const theirs = host.locator('[data-face-off-side="1"]')
  await theirs.getByRole('button', { name: 'Invite a player instead' }).click()
  await expect(theirs.getByRole('button', { name: 'Share a link' })).toBeVisible()
  await expect(draft).toBeVisible()

  await host.goto('/battles')
  await host.locator('[data-draft-resume]').click({ button: 'right' })
  await host.getByRole('menuitem', { name: 'Delete battle' }).click()
  await host.getByRole('alertdialog', { name: 'Delete battle?' }).getByRole('button', { name: 'Delete battle' }).click()
  await expect(host.locator('[data-draft-resume]')).toHaveCount(0)
})
