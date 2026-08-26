import type { BrowserContextOptions, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const desktopContext = { viewport: { width: 1440, height: 900 } } satisfies BrowserContextOptions

/**
 * Makes an account and leaves the page signed into it.
 *
 * Every journey starts here now: a battle, a roster and a seat all belong to an
 * account, so there is no way to reach any of them otherwise. The email is unique
 * per call because the suite shares one database across specs.
 */
export async function signUp(page: Page, name: string) {
  await page.goto('/sign-in')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'I need an account' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(`${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create the account' }).click()
  await page.getByRole('button', { name: `Account menu for ${name}` }).waitFor()
}

export function uniqueName(base: string) {
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

/** Retries interactions that can reach server-rendered controls before hydration. */
async function retryUntilVisible(outcome: Locator, action: () => Promise<void>) {
  await expect(async () => {
    if (await outcome.isVisible()) return
    await action()
    await expect(outcome).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
}

export async function befriend(requester: Page, recipient: Page) {
  const requesterName = (await requester.locator('button[aria-label^="Account menu for "]').getAttribute('aria-label'))?.replace(
    'Account menu for ',
    '',
  )
  const recipientName = (await recipient.locator('button[aria-label^="Account menu for "]').getAttribute('aria-label'))?.replace(
    'Account menu for ',
    '',
  )
  if (!requesterName || !recipientName) throw new Error('Both players must be signed in before becoming friends.')
  await requester.goto('/friends')
  const sent = requester.locator('section').filter({ hasText: 'Sent requests' }).filter({ hasText: recipientName })
  await retryUntilVisible(sent, async () => {
    await requester.getByPlaceholder('Search by account name').fill(recipientName)
    // The row for this player, not whoever the search happens to be showing: results
    // narrow a request behind the typing, and every player found offers the same button.
    await requester.locator(`[data-person="${recipientName}"]`).getByRole('button', { name: 'Add friend' }).click()
  })
  await recipient.goto('/friends')
  const request = recipient.locator('section').filter({ hasText: 'Friend requests' }).filter({ hasText: requesterName })
  const accepted = recipient.locator('section').filter({ hasText: 'Friends' }).filter({ hasText: requesterName })
  await retryUntilVisible(accepted, () => request.getByRole('button', { name: 'Accept' }).click())
  await requester.goto('/friends')
  await expect(requester.locator('section').filter({ hasText: 'Friends' }).filter({ hasText: recipientName })).toBeVisible()
}

export async function waitForRosterSave(page: Page, action: () => Promise<unknown>, expectedText?: string) {
  // Autosaves are serialized. Let an earlier render finish before deciding which
  // response belongs to this action, otherwise a fast setup save can satisfy the
  // waiter for a later name or unit change.
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  const saved = page.waitForResponse((response) => {
    const postData = response.request().postData()
    return (
      response.ok() &&
      response.request().method() === 'POST' &&
      Boolean(postData?.includes('"visibility"') && postData.includes('"picks"')) &&
      (!expectedText || Boolean(postData?.includes(expectedText)))
    )
  })
  await action()
  await saved
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
}

export async function createRoster(
  page: Page,
  { faction, detachment, name, size }: { faction: string; detachment: RegExp; name?: string; size?: RegExp },
) {
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill(faction)
  await page.getByRole('option', { name: faction, exact: true }).click()
  // A 2v1 ally brings half the battle size, so the size is a choice rather than the default.
  if (size) {
    await dialog.getByRole('combobox', { name: 'Battle size' }).click()
    await page.getByRole('option', { name: size }).click()
  }
  await dialog.getByRole('button', { name: new RegExp(`^Select (?:${detachment.source})$`, detachment.flags) }).click()
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  const rosterName = name ?? `${faction} roster`
  await waitForRosterSave(page, () => page.getByLabel('List name').fill(rosterName), rosterName)
  await page.reload()
  await expect(page.getByLabel('List name')).toHaveValue(rosterName)
  const picker = page.getByLabel('Add a unit')
  if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await expect(picker).toBeVisible()
  return rosterName
}

/** The practice opponent every instance seats, named as the interface names it. */
export const PRACTICE_OPPONENT = 'Practice Opponent'

/**
 * Opens a battle from the dialog, in whichever supported shape is asked for.
 *
 * `ally` puts the opener on the solo side; `yourAlly` puts them on the pair.
 */
export async function createBattle(
  page: Page,
  {
    opponent,
    ally,
    yourAlly,
    secondOpponent,
    practice = false,
    beforeCreate,
  }: {
    opponent?: string
    ally?: string
    yourAlly?: string
    secondOpponent?: string
    practice?: boolean
    beforeCreate?: (dialog: Locator) => Promise<void>
  } = {},
) {
  await page.goto('/battles')
  const dialog = page.getByRole('dialog', { name: 'Start a battle' })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'New battle' }).click())
  if (secondOpponent) await page.getByRole('button', { name: /^Doubles/ }).click()
  else if (ally) {
    await page.getByRole('button', { name: /^Solo vs pair/ }).click()
    await page.getByRole('button', { name: /^I’m solo/ }).click()
  } else if (yourAlly) {
    await page.getByRole('button', { name: /^Solo vs pair/ }).click()
    await page.getByRole('button', { name: /^I’m on the pair/ }).click()
  }
  if (yourAlly) {
    await page.getByRole('combobox', { name: 'Your ally' }).click()
    await page.getByRole('option', { name: yourAlly, exact: true }).click()
  }
  await page.getByRole('combobox', { name: secondOpponent || ally ? 'First opponent' : 'Opponent' }).click()
  await page.getByRole('option', { name: practice ? PRACTICE_OPPONENT : opponent, exact: true }).click()
  if (ally) {
    await page.getByRole('combobox', { name: 'Second opponent' }).click()
    await page.getByRole('option', { name: ally, exact: true }).click()
  }
  if (secondOpponent) {
    await page.getByRole('combobox', { name: 'Second opponent' }).click()
    await page.getByRole('option', { name: secondOpponent, exact: true }).click()
  }
  const matchup = page.getByLabel('Battle matchup')
  await expect(matchup).toContainText('You')
  for (const player of [yourAlly, opponent, ally, secondOpponent].filter((name): name is string => Boolean(name))) {
    await expect(matchup).toContainText(player)
  }
  await beforeCreate?.(dialog)
  await page.getByRole('button', { name: 'Create battle' }).click()
  await page.waitForURL(/\/battles\/[^/]+$/)
  return page.url()
}

/** Retry an SSR-visible setup control until its command-derived active section changes. */
async function moveSetup(active: Locator, from: string, action: () => Promise<void>) {
  await expect(async () => {
    if ((await active.innerText().catch(() => from)) !== from) return
    await action()
    await expect.poll(() => active.innerText().catch(() => from), { timeout: 1_000 }).not.toBe(from)
  }).toPass({ timeout: 20_000 })
}

/**
 * Records the roll-off and walks on to the last section, which is where the battle begins.
 *
 * The roll-off is recorded a section before the battle starts, because what a unit does
 * before the first turn is resolved starting with whoever is taking it — and it has to
 * be recorded, since nothing may be left behind unsettled.
 */
export async function recordFirstTurn(page: Page, firstSide?: string) {
  await setupStep(page, 'First turn')
  const choice = page.getByRole('group', { name: 'First turn' })
  const side = firstSide ? choice.getByRole('button', { name: firstSide }) : choice.getByRole('button').first()
  await expect(async () => {
    if ((await side.getAttribute('aria-pressed')) === 'true') return
    await side.click({ timeout: 1_000 })
    await expect(side).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await setupStep(page, 'Pre-battle rules')
}

/** Setup shows one section at a time, and the section is shared, so a helper walks to the one it needs. */
export async function setupStep(page: Page, label: string) {
  // By `data-step` rather than by accessible name: a chip is named by its section and
  // the line under it, so a section whose blurb happens to name another one — "Choose
  // the armies first" under Mission — matches two chips and the locator refuses.
  const chip = page.locator(`nav[aria-label="Setup sections"] button[data-step="${label}"]`)
  const active = page.locator('[aria-current="step"]')
  for (let guard = 0; guard < 8; guard += 1) {
    if ((await chip.getAttribute('aria-current')) === 'step') return
    if (await chip.isEnabled()) {
      await expect(async () => {
        if ((await chip.getAttribute('aria-current')) === 'step') return
        await chip.click({ timeout: 1_000 })
        await expect(chip).toHaveAttribute('aria-current', 'step', { timeout: 1_000 })
      }).toPass({ timeout: 20_000 })
      return
    }
    const previous = await active.innerText()
    const next = page.getByRole('button', { name: 'Next', exact: true })
    // An allied side whose two armies brought different Force Dispositions has to say
    // which one it plays before the matchup is settled. Tests that are not about that
    // choice take the first card offered.
    if (/mission/i.test(previous) && !(await next.isEnabled())) {
      await expect(async () => {
        if (await next.isEnabled()) return
        const asked = page.getByRole('group', { name: /^Force Disposition for / })
        for (let at = 0; at < (await asked.count()); at += 1) {
          await asked.nth(at).getByRole('button').first().click({ timeout: 1_000 })
        }
        await expect(next).toBeEnabled({ timeout: 1_000 })
      }).toPass({ timeout: 20_000 })
    }
    // Tests that are not about deployment order use the first side as their deterministic default.
    if (/defender/i.test(previous) && !(await next.isEnabled())) {
      await expect(async () => {
        if (await next.isEnabled()) return
        await page.getByRole('group', { name: 'Defender' }).getByRole('button').first().click({ timeout: 1_000 })
        await expect(next).toBeEnabled({ timeout: 1_000 })
      }).toPass({ timeout: 20_000 })
    }
    await moveSetup(active, previous, async () => {
      await expect(next).toBeEnabled({ timeout: 1_000 })
      await next.click({ timeout: 1_000 })
    })
  }
  throw new Error(`Setup never reached the ${label} step`)
}

/** Attaches a saved list to a seat: your own by default, or a named one such as a practice opponent's. */
export async function attachRoster(page: Page, name: string, { forPlayer }: { forPlayer?: string } = {}) {
  await setupStep(page, 'Armies')
  const chooser = forPlayer
    ? page.getByRole('button', { name: new RegExp(`roster for ${forPlayer}$`) })
    : page.getByRole('button', { name: /^(Choose|Change) roster/ }).first()
  await chooser.click()
  const attached = page.waitForResponse(
    (response) =>
      response.ok() && response.request().method() === 'POST' && Boolean(response.request().postData()?.includes('attach-saved-roster')),
  )
  await page
    .getByRole('dialog', { name: /roster$/ })
    .getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) })
    .click()
  const request = (await attached).request()
  expect(request.postData()).not.toContain(name)
  // The table strip names it too, so this is the first of two rather than the only one.
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

export async function chooseBattlefield(page: Page) {
  const battlefieldStep = page.locator('nav[aria-label="Setup sections"] button[data-step="Battlefield"]')
  if ((await battlefieldStep.getAttribute('data-complete')) === 'true') return
  await setupStep(page, 'Battlefield')
  const selected = page.getByRole('button', { name: /^Selected layout/ })
  // By position, not by name: which layouts a matchup offers follows the pinned rules data.
  const chosen = page.waitForResponse((response) => response.ok() && response.request().method() === 'POST')
  await page
    .getByRole('button', { name: /^Select layout / })
    .first()
    .click()
  await chosen
  await expect(selected).toBeVisible()
}

/**
 * Clears the prompts an advance can raise.
 *
 * A tactical hand is dealt as a turn opens, and a card that pays at the end of the
 * phase or turn asks for its points as that moment passes. Both stand between a
 * press of the advance button and the next phase.
 */
export const advanceButton = (page: Page) => page.getByRole('button', { name: /^(End the .+ phase|Pass the turn)$/ })

/** The hand being dealt: this table's own, or the practice opponent's it is also playing. */
const drawPrompt = (page: Page) => page.getByRole('dialog', { name: /secondary missions$/ })
/** What the turn the other side just finished owed this one, asked as the turn arrives. */
const owedPrompt = (page: Page) => page.getByRole('dialog', { name: /^Scoring end of their turn/ })

/**
 * Clears whatever a turn opens with: what their turn owed, and the hand this one deals.
 *
 * Raced against the board rather than waited for: both prompts are modal, so the board
 * only reaches the accessibility tree when nothing is covering it, and whichever
 * arrives first is the answer.
 */
export async function takeTheTurn(page: Page) {
  for (let guard = 0; guard < 3; guard += 1) {
    const seen = await Promise.race([
      owedPrompt(page)
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => 'owed'),
      drawPrompt(page)
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => 'drawn'),
      advanceButton(page)
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => 'board'),
    ]).catch(() => 'board')
    if (seen === 'board') return
    const prompt = seen === 'owed' ? owedPrompt(page) : drawPrompt(page)
    // Bounded: the prompt waits on the deck, and a hung wait should fail here rather
    // than hold the whole test open on one click.
    await prompt.getByRole('button', { name: 'Take the turn' }).click({ timeout: 15_000 })
    await expect(prompt).toBeHidden()
  }
}

/**
 * Ends the current phase, clearing whatever stands in front of it.
 *
 * A tactical hand is dealt as a turn opens, and a card that pays at the end of the
 * phase or turn asks for its points as that moment passes. Both are modal, which
 * takes the board out of the accessibility tree until they are answered.
 */
export async function advance(page: Page) {
  for (let guard = 0; guard < 3; guard += 1) {
    for (const prompt of [owedPrompt(page), drawPrompt(page)]) {
      if (!(await prompt.isVisible().catch(() => false))) continue
      await prompt.getByRole('button', { name: 'Take the turn' }).click({ timeout: 15_000 })
      await expect(prompt).toBeHidden()
    }
    const phase = page.locator('[data-scoreboard] h1')
    const before = await phase.textContent()
    const clicked = await advanceButton(page)
      .click({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    if (clicked) {
      const scoring = page.getByRole('dialog', { name: /^Scoring end of (turn|command|movement|shooting|charge|fight) / })
      await expect
        .poll(async () =>
          (await scoring.isVisible().catch(() => false)) ? 'scoring' : (await phase.textContent()) === before ? 'waiting' : 'advanced',
        )
        .not.toBe('waiting')
      if (await scoring.isVisible().catch(() => false)) {
        await scoring
          .getByRole('button', { name: /^(Pass the turn|End the phase)$/ })
          .click({ timeout: 3_000 })
          .catch(() => undefined)
      }
      const discard = page.getByRole('dialog', { name: 'Discard tactical secondaries?' })
      if (await discard.isVisible().catch(() => false)) {
        await discard.getByRole('button', { name: 'Keep hand' }).click()
      }
      await expect.poll(() => phase.textContent()).not.toBe(before)
      break
    }
    if (guard === 2) throw new Error('Never reached the button that ends the phase')
  }
}

export async function startBattle(page: Page, firstSide?: string) {
  await chooseBattlefield(page)
  await setupStep(page, 'Secondaries')
  // One per side this table settles cards for, so every one of them has to be ready.
  await expect(page.locator('[data-secondary-deck-ready]').first()).toBeVisible()
  await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
  await recordFirstTurn(page, firstSide)
  await page.getByRole('button', { name: 'Start battle' }).click()
  // The hand is dealt over the board, and a modal hides the board from the accessibility
  // tree, so the prompt has to be cleared before the phase can be read.
  await expect(
    page
      .getByRole('dialog', { name: 'Your secondary missions' })
      .or(page.getByRole('heading', { name: 'command phase' }))
      .first(),
  ).toBeVisible()
  await takeTheTurn(page)
  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
}

export async function setupBattle(
  host: Page,
  guest: Page,
  {
    opponent,
    hostRoster,
    guestRoster,
    beforeStart,
  }: { opponent: string; hostRoster: string; guestRoster: string; beforeStart?: () => Promise<void> },
) {
  await befriend(host, guest)
  const url = await createBattle(host, { opponent })
  await guest.goto(url)
  await attachRoster(host, hostRoster)
  await setupStep(guest, 'Armies')
  await expect(guest.getByText(hostRoster, { exact: true }).first()).toBeVisible()
  await attachRoster(guest, guestRoster)
  await expect(host.getByText(guestRoster, { exact: true }).first()).toBeVisible()
  // Cards are chosen while the battle is still being set up, not once it is running,
  // and the wizard only reaches that step once the battlefield is settled.
  if (beforeStart) {
    await chooseBattlefield(host)
    await setupStep(host, 'Secondaries')
    await beforeStart()
  }
  await startBattle(host)
  await expect(guest.getByRole('heading', { name: 'command phase' })).toBeVisible()
  return url
}
