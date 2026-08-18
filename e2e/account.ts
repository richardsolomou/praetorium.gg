import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Makes an account and leaves the page signed into it.
 *
 * Every journey starts here now: a battle, a roster and a seat all belong to an
 * account, so there is no way to reach any of them otherwise. The email is unique
 * per call because the suite shares one database across specs.
 */
export async function signUp(page: Page, name: string) {
  await page.goto('/signin')
  await page.getByRole('button', { name: 'I need an account' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(`${name.toLowerCase()}-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create the account' }).click()
  await page.getByRole('button', { name: `Account menu for ${name}` }).waitFor()
}

export function uniqueName(base: string) {
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
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
  await requester.getByPlaceholder('Search by account name').fill(recipientName)
  await requester.getByRole('button', { name: 'Add friend' }).click()
  await recipient.goto('/friends')
  const request = recipient.locator('section').filter({ hasText: 'Friend requests' }).filter({ hasText: requesterName })
  await request.getByRole('button', { name: 'Accept' }).click()
  await expect(recipient.locator('section').filter({ hasText: 'Friends' }).filter({ hasText: requesterName })).toBeVisible()
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

export async function createRoster(page: Page, { faction, detachment, name }: { faction: string; detachment: RegExp; name?: string }) {
  await page.goto('/rosters')
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill(faction)
  await page.getByRole('option', { name: faction, exact: true }).click()
  await dialog.getByRole('button', { name: new RegExp(`^Select (?:${detachment.source})$`, detachment.flags) }).click()
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/.+\/edit/)
  const rosterName = name ?? `${faction} roster`
  await waitForRosterSave(page, () => page.getByLabel('List name').fill(rosterName), rosterName)
  await page.reload()
  await expect(page.getByLabel('List name')).toHaveValue(rosterName)
  return rosterName
}

export async function createBattle(page: Page, { opponent, solo = false }: { opponent?: string; solo?: boolean } = {}) {
  await page.goto('/battles')
  await page.getByRole('button', { name: 'New battle' }).click()
  if (solo) {
    await page.getByRole('button', { name: 'Solo practice' }).click()
  } else {
    await page.getByRole('combobox', { name: 'Opponent' }).click()
    await page.getByRole('option', { name: opponent, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Create battle' }).click()
  await page.waitForURL(/\/b\//)
  return page.url()
}

/** Setup shows one step at a time, so a helper has to walk to the step it needs. */
export async function setupStep(page: Page, label: string) {
  const chip = page.getByRole('navigation', { name: 'Setup sections' }).getByRole('button', { name: label })
  const active = page.locator('[aria-current="step"]')
  for (let guard = 0; guard < 5; guard += 1) {
    if ((await chip.getAttribute('aria-current')) === 'step') return
    if (await chip.isEnabled()) {
      await chip.click()
      await expect(active).toContainText(label, { ignoreCase: true })
      return
    }
    const previous = await active.innerText()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => active.innerText()).not.toBe(previous)
  }
  throw new Error(`Setup never reached the ${label} step`)
}

export async function attachRoster(page: Page, name: string) {
  await setupStep(page, 'Armies')
  await page.getByRole('button', { name: /Choose roster|Change roster/ }).click()
  await page
    .getByRole('dialog', { name: 'Choose your roster' })
    .getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) })
    .click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

export async function chooseBattlefield(page: Page) {
  const battlefieldStep = page.getByRole('navigation', { name: 'Setup sections' }).getByRole('button', { name: /Battlefield/ })
  if ((await battlefieldStep.innerText()).trimStart().startsWith('✓')) return
  await setupStep(page, 'Battlefield')
  const selected = page.getByRole('button', { name: /^Selected layout/ })
  // By position, not by name: which layouts a matchup offers follows the pinned rules data.
  await page
    .getByRole('button', { name: /^Select layout / })
    .first()
    .click()
  await expect(selected).toBeVisible()
}

export async function startBattle(page: Page, firstPlayer?: string) {
  await chooseBattlefield(page)
  await setupStep(page, 'Your army')
  await expect(page.locator('[data-secondary-deck-ready]')).toHaveAttribute('data-secondary-deck-ready', 'true')
  await setupStep(page, 'Start')
  if (firstPlayer) {
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Attacker and first turn' }) })
    await section.getByText('First turn', { exact: true }).locator('..').getByRole('button', { name: firstPlayer }).click()
  }
  await page.getByRole('button', { name: 'Start battle' }).click()
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
  await expect(guest.getByText(hostRoster, { exact: true })).toBeVisible()
  await attachRoster(guest, guestRoster)
  await expect(host.getByText(guestRoster, { exact: true })).toBeVisible()
  // Cards are chosen while the battle is still being set up, not once it is running,
  // and the wizard only reaches that step once the battlefield is settled.
  if (beforeStart) {
    await chooseBattlefield(host)
    await setupStep(host, 'Your army')
    await beforeStart()
  }
  await startBattle(host)
  await expect(guest.getByRole('heading', { name: 'command phase' })).toBeVisible()
  return url
}
