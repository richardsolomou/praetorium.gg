import { createHmac } from 'node:crypto'
import type { BrowserContextOptions, Locator, Page, Request, Response } from '@playwright/test'
import { expect } from '@playwright/test'
import { PHASES } from '../src/core/battle'
import type { RosterPick } from '../src/core/roster'
import type { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { PREVIEW_EMAIL, PREVIEW_PASSWORD } from '../scripts/seedPreview'
import { lastPathSegment, productOperator, savedWork, seedRoster, userIdFor } from './storage'
import { baseURL } from './stackEnv'
import { screenshot } from './screenshots'

export const desktopContext = { viewport: { width: 1440, height: 900 } } satisfies BrowserContextOptions

function newAccount(name: string) {
  return {
    email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID()}@example.test`,
    password: 'a-long-enough-password',
  }
}

/**
 * Makes an account through the endpoint the sign-up form posts to, so the page's next load is signed into it.
 *
 * A battle, a roster and a seat all belong to an account, so there is no way to
 * reach any of them otherwise. The email is unique per call because the suite
 * shares one database across specs.
 */
export async function signUp(page: Page, name: string) {
  const account = newAccount(name)
  // Better Auth refuses a cookie-carrying request without an Origin, as it would a cross-site form.
  const response = await page.request.post('/api/auth/sign-up/email', { data: { name, ...account }, headers: { origin: baseURL } })
  expect(response.ok(), await response.text()).toBe(true)
  return account
}

/** Makes an account through the sign-up form and waits on the signed-in home page, for tests about signing up. */
export async function signUpThroughForm(page: Page, name: string) {
  const account = newAccount(name)
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'I need an account' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page
    .getByRole('button', { name: `Account menu for ${name}`, includeHidden: true })
    .first()
    .waitFor({ state: 'attached' })
  return account
}

/** Submits the sign-in form for an existing account. */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

/** Signs into the seeded preview player, who is an administrator. */
export async function signInAsPreview(page: Page) {
  await signIn(page, PREVIEW_EMAIL, PREVIEW_PASSWORD)
  await page.waitForURL('/')
}

/** Signs up and saves a private copy of the preview Necrons list under a new name. */
export async function savedArmy(
  page: Page,
  label: string,
  roster: { name: string } & Partial<Parameters<SpacetimeOperator['saveRoster']>[0]>,
) {
  const account = await signUp(page, uniqueName(label))
  const operator = await productOperator()
  const source = (await operator.roster('preview-necrons-cursed-skyshroud'))!
  const userId = await userIdFor(account.email)
  const id = crypto.randomUUID()
  await operator.saveRoster({ ...source, id, userId, automaticName: false, visibility: 'private', now: Date.now(), ...roster })
  return { id, userId, operator }
}

/** Chooses the visibility new rosters, copies and imports start with, and waits until it leaves the device. */
export async function chooseRosterDefault(page: Page, name: 'Private' | 'Unlisted' | 'Public') {
  await page.goto('/profile')
  await choosePlayerDefault(page, 'Roster visibility', name)
}

/** Presses a profile default on the open profile page until it reads as pressed, and waits until the account holds it. */
export async function choosePlayerDefault(page: Page, setting: 'Roster visibility' | 'Battle size', name: string) {
  const group = page.getByRole('group', { name: setting })
  const choice = new RegExp(`^${name}`)
  await retryUntilVisible(group.getByRole('button', { name: choice, pressed: true }), () =>
    group.getByRole('button', { name: choice }).click(),
  )
  await expect.poll(async () => (await savedWork(page))?.operations.length ?? 0).toBe(0)
  // A choice reads as pressed while it is still saving, so only a reload proves the account holds it.
  await expect(async () => {
    await page.reload()
    await group.getByRole('button', { name: choice }).waitFor()
    if (await group.getByRole('button', { name: choice, pressed: true }).isVisible()) return
    // The reload cut the save short, so press it again and check once more.
    await group.getByRole('button', { name: choice }).click()
    throw new Error(`${setting} is not saved as ${name} yet`)
  }).toPass()
}

/** Saves a small picture as the signed-in player's avatar. */
export async function uploadAvatar(page: Page) {
  await page.goto('/profile')
  // A file chosen before hydration never reaches the form, which leaves Save profile disabled.
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Choose profile picture').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEX/W1e1okn/AAAADElEQVQI12NgIA0AAAAwAAHHqoWOAAAAAElFTkSuQmCC',
      'base64',
    ),
  })
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved.')).toBeVisible()
}

/** Signs out from the account menu, reopening the menu until it shows: a press before hydration opens nothing. */
export async function signOut(page: Page) {
  const item = page.getByRole('menuitem', { name: 'Sign out', exact: true })
  await retryUntilVisible(item, () =>
    page
      .getByRole('button', { name: /^Account menu for / })
      .filter({ visible: true })
      .click(),
  )
  await item.click()
}

export function uniqueName(base: string) {
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

/** Retries interactions that can reach server-rendered controls before hydration. */
export async function retryUntilVisible(outcome: Locator, action: () => Promise<void>) {
  await expect(async () => {
    if (await outcome.isVisible()) return
    await action()
    await expect(outcome).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
}

/** A visitor's roster setup, opened from the rosters page as a signed-in player opens theirs. */
export async function visitorSetup(page: Page) {
  await page.goto('/rosters')
  await page.waitForLoadState('networkidle')
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(setup, () => page.getByRole('button', { name: 'New roster', exact: true }).click())
  return setup
}

/** The roster page's share dialog holds these, so choosing one goes through Share… first. */
const SHARED_ROSTER_ACTIONS = new Set(['Exchange code', 'Print'])

/**
 * Chooses an item from a roster's Roster actions menu, reopening the menu until the item shows: a press before
 * hydration opens nothing. Export, exchange code and print are chosen from the share dialog the menu opens.
 */
export async function chooseRosterAction(page: Page, item: string | RegExp) {
  if (typeof item === 'string' && SHARED_ROSTER_ACTIONS.has(item)) {
    const dialog = await openRosterShare(page)
    await dialog.getByRole('button', { name: new RegExp(`^${item}`) }).click()
    return
  }
  const choice = page.getByRole('menuitem', { name: item, exact: true })
  await retryUntilVisible(choice, () => page.getByRole('button', { name: 'Roster actions', exact: true }).click())
  await choice.click()
}

/** Opens the roster page's share dialog from its Roster actions menu. */
export async function openRosterShare(page: Page) {
  // The item also names the roster's visibility, after the label.
  await chooseRosterAction(page, /^Share…/)
  const dialog = page.getByRole('dialog', { name: /^Share / })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Opens the import dialog from the rosters page once its text box answers. */
export async function openImport(page: Page) {
  await page.goto('/rosters')
  const dialog = page.getByRole('dialog', { name: 'Import roster', exact: true })
  await retryUntilVisible(dialog.getByLabel('Roster text'), () => page.getByRole('button', { name: 'Import roster', exact: true }).click())
  return dialog
}

/** Chooses an item from a library row's actions menu, reopening the menu until the item shows. */
export async function chooseLibraryAction(page: Page, roster: string, item: string | RegExp) {
  const choice = page.getByRole('menuitem', { name: item, exact: true })
  await retryUntilVisible(choice, () => page.getByRole('button', { name: `Actions for ${roster}`, exact: true }).click())
  await choice.click()
}

/** Opens a library row's share dialog, which holds its visibility, link, export, exchange code and print. */
export async function openLibraryShare(page: Page, roster: string) {
  await chooseLibraryAction(page, roster, /^Share…/)
  const dialog = page.getByRole('dialog', { name: `Share ${roster}` })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Follows a link until the address changes: the router's hydration cancels a navigation that started before it. */
export async function followLink(link: Locator, url: string | RegExp) {
  await expect(async () => {
    if (await link.isVisible()) await link.click({ timeout: 1_000 })
    await expect(link.page()).toHaveURL(url, { timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
}

/** The catalogue unit picker lists every faction's units behind one search; each option names its faction. */
export async function chooseUnit(page: Page, side: string, faction: string, name: string) {
  const search = page.getByPlaceholder('Search units…')
  await retryUntilVisible(search, () => page.getByRole('combobox', { name: `${side} unit`, exact: true }).click())
  await search.fill(`${name} ${faction}`)
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await page.getByRole('option', { name: new RegExp(`^${escaped}, ${faction}(?:, \\d+ pts)?$`) }).click()
  // The next pick looks for the same search box, so it must not find this one still closing.
  await expect(search).toBeHidden()
}

export async function befriend(requester: Page, recipient: Page) {
  const accountMenu = (page: Page) => page.locator('[data-web-app-chrome] button[aria-label^="Account menu for "]')
  await recipient.goto('/friends')
  const recipientName = (await accountMenu(recipient).getAttribute('aria-label'))?.replace('Account menu for ', '')
  await requester.goto('/friends')
  const requesterName = (await accountMenu(requester).getAttribute('aria-label'))?.replace('Account menu for ', '')
  if (!requesterName || !recipientName) throw new Error('Both players must be signed in before becoming friends.')
  const sent = requester.locator('section').filter({ hasText: 'Sent requests' }).filter({ hasText: recipientName })
  await retryUntilVisible(sent, async () => {
    await requester.getByPlaceholder('Search by account name').fill('')
    await requester.getByPlaceholder('Search by account name').fill(recipientName)
    // The row for this player, not whoever the search happens to be showing: results
    // narrow a request behind the typing, and every player found offers the same button.
    await requester.locator(`[data-person="${recipientName}"]`).getByRole('button', { name: 'Add friend' }).click({ timeout: 1_000 })
  })
  await recipient.goto('/friends')
  const request = recipient.locator('section').filter({ hasText: 'Friend requests' }).filter({ hasText: requesterName })
  const accepted = recipient.locator('section').filter({ hasText: 'Friends' }).filter({ hasText: requesterName })
  // A press still saving disables Accept, and a click left waiting on it outlasts the retry.
  await retryUntilVisible(accepted, () => request.getByRole('button', { name: 'Accept' }).click({ timeout: 1_000 }))
  await requester.goto('/friends')
  await expect(requester.locator('section').filter({ hasText: 'Friends' }).filter({ hasText: recipientName })).toBeVisible()
}

/** A roster save, told apart from a price request by the fields only a saved list carries. */
export function isRosterSave(request: Request) {
  const body = request.postData()
  return request.method() === 'POST' && Boolean(body?.includes('"visibility"') && body.includes('"picks"'))
}

/** Every roster save a page sends from now on. */
export function recordSaves(page: Page) {
  const saves: string[] = []
  page.on('request', (request) => {
    if (isRosterSave(request)) saves.push(request.postData()!)
  })
  return saves
}

export async function waitForRosterSave(page: Page, action: () => Promise<unknown>, expectedText?: string) {
  // Autosaves are serialized. Let an earlier render finish before deciding which
  // response belongs to this action, otherwise a fast setup save can satisfy the
  // waiter for a later name or unit change.
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  // Whichever tab holds the sync lease sends the save, so listen across the whole context.
  const saved = page
    .context()
    .waitForEvent(
      'response',
      (response) =>
        response.ok() &&
        isRosterSave(response.request()) &&
        (!expectedText || Boolean(response.request().postData()?.includes(expectedText))),
    )
  await action()
  await saved
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
}

/**
 * Names the open roster and waits for a save that carries the name. Hydration can put the saved name back over one
 * typed before it, which then never saves, so the name is typed again until a save carries it.
 */
export async function renameRoster(page: Page, name: string) {
  const builder = page.locator('[data-roster-builder]')
  await expect(builder).toHaveAttribute('data-saving', 'false')
  let saved = false
  const onResponse = (response: Response) => {
    if (response.ok() && isRosterSave(response.request()) && response.request().postData()?.includes(name)) saved = true
  }
  // Whichever tab holds the sync lease sends the save, so listen across the whole context.
  page.context().on('response', onResponse)
  const field = page.getByLabel('List name')
  try {
    await expect(async () => {
      if (!saved && (await field.inputValue()) !== name) await field.fill(name)
      await expect.poll(() => saved, { timeout: 3_000 }).toBe(true)
    }).toPass({ timeout: 30_000 })
  } finally {
    page.context().off('response', onResponse)
  }
  await expect(builder).toHaveAttribute('data-saving', 'false')
}

/** Saves an ability alert and waits for the account to accept it, so a battle fielded next carries it. */
export async function saveAlert(editor: Locator, ability: string) {
  const saved = editor
    .page()
    .context()
    .waitForEvent('response', (response) => {
      const postData = response.request().postData()
      return response.ok() && Boolean(postData?.includes('"timings"') && postData.includes(ability))
    })
  await editor.getByRole('button', { name: 'Save alert' }).click()
  await saved
  await expect(editor.page().locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
}

/** Adds a unit by name from the roster's search and waits for the save to leave the device. */
export async function addUnit(page: Page, name: string) {
  await page.getByLabel('Add a unit').fill(name)
  await waitForRosterSave(page, () =>
    page
      .getByRole('button', { name: `Add ${name}`, exact: true })
      .first()
      .click(),
  )
}

/** Picks a faction in an open roster setup, reopening the list if hydration swallowed the first press. */
export async function chooseFaction(setup: Locator, faction: string) {
  const search = setup.page().getByPlaceholder('Search factions…')
  await retryUntilVisible(search, () => setup.getByRole('combobox', { name: 'Faction' }).click())
  await search.fill(faction)
  await setup.page().getByRole('option', { name: faction, exact: true }).click()
  // A closing list still shows its search, which would make the next pick type into it instead of reopening the list.
  await expect(search).toBeHidden()
}

/** Picks a battle size, choosing again when a click lands before the menu takes it. */
export async function chooseBattleSize(setup: Locator, size: RegExp) {
  const box = setup.getByRole('combobox', { name: 'Battle size' })
  // Each standard size lists before the custom size that keeps its limits.
  const option = setup.page().getByRole('option', { name: size }).first()
  await expect(async () => {
    await box.click()
    const label = (await option.innerText({ timeout: 5_000 })).trim()
    await option.click({ timeout: 5_000 })
    await expect(box).toContainText(label, { timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
}

export async function createRoster(
  page: Page,
  { faction, detachment, name, size, rules }: { faction: string; detachment: RegExp; name?: string; size?: RegExp; rules?: string },
) {
  await page.goto('/rosters')
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'New roster', exact: true }).click())
  await chooseFaction(dialog, faction)
  if (rules) {
    await dialog.getByRole('combobox', { name: 'Rules version' }).click()
    await page.getByRole('option', { name: rules, exact: true }).click()
  }
  // A 2v1 ally brings half the battle size, so the size is a choice rather than the default.
  if (size) await chooseBattleSize(dialog, size)
  await dialog.getByRole('button', { name: new RegExp(`^Select (?:${detachment.source})$`, detachment.flags) }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
  const rosterName = name ?? `${faction} roster`
  await renameRoster(page, rosterName)
  await page.reload()
  await openedInBuilder(page, rosterName)
  return rosterName
}

async function openedInBuilder(page: Page, name: string) {
  await expect(page.getByLabel('List name')).toHaveValue(name)
  const picker = page.getByLabel('Add a unit')
  if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Add units', exact: true }).click()
  await expect(picker).toBeVisible()
}

/**
 * Each army's book and the id and first offered Force Disposition of each Detachment tests seed, as the current
 * rules version stores them: a book the default rules version reprints is stored under that version's id.
 */
const ARMIES = {
  Necrons: {
    catalogueId: 'b654-a18a-ea1-3bf2',
    detachments: {
      'Annihilation Legion': ['6493-9079-727d-d95f', 'purge-the-foe'],
      'Awakened Dynasty': ['9ebf-2bbd-6059-1d40', 'take-and-hold'],
      'Canoptek Court': ['aed9-cb3b-1d0c-f87d', 'take-and-hold'],
      'Cryptek Conclave': ['1de5-2462-f59c-db94', 'priority-assets'],
      'Cursed Legion': ['c4ee-83c7-812c-5ff0', 'purge-the-foe'],
      'Hypercrypt Legion': ['8861-5385-8fd1-dfee', 'reconnaissance'],
      'Obeisance Phalanx': ['163f-63bd-f2e1-5e7', 'disruption'],
      'Pantheon of Woe': ['1707-57c5-676e-90d9', 'disruption'],
      'Skyshroud Spearhead': ['51c2-e233-ea51-14df', 'reconnaissance'],
      'Starshatter Arsenal': ['e0fd-c955-4822-6dba', 'priority-assets'],
    },
  },
  'Death Guard': {
    catalogueId: '5108-f98-63c2-53cb',
    detachments: {
      'Champions of Contagion': ['fd92-8b6d-0ef2-e14d', 'take-and-hold'],
      'Flyblown Host': ['df4a-2ead-43d5-ea61', 'reconnaissance'],
      'Shamblerot Vectorium': ['7a84-2212-be14-a713', 'disruption'],
    },
  },
  'Space Marines': {
    catalogueId: 'mfm-1-6~e0af-67df-9d63-8fb7',
    detachments: {
      'Gladius Task Force': ['d2dc-693e-b491-b16d', 'take-and-hold'],
      'Tactical Brethren': ['ec44-c977-f09b-3f28', 'priority-assets'],
    },
  },
  'Dark Angels': {
    catalogueId: 'mfm-1-6~470a-6daa-9014-12df',
    detachments: {
      'Inner Circle Task Force': ['a141-49c8-fd84-4c6d', 'priority-assets'],
      'Wrath of the Rock': ['9d23-833a-17cb-2d7d', 'take-and-hold'],
    },
  },
  'Adeptus Custodes': {
    catalogueId: 'mfm-1-6~1f19-6509-d906-ca10',
    detachments: { 'Aquilan Shield': ['pc-a9d7919f28ff8531bbfa48e0', 'take-and-hold'] },
  },
  Aeldari: { catalogueId: '34a5-8c7e-f468-82d1', detachments: { Warhost: ['3c31-6fac-9914-827a', 'reconnaissance'] } },
  'Astra Militarum': { catalogueId: 'b0ae-12a5-c84-ea45', detachments: { 'Combined Arms': ['67ce-ebd5-b428-e4f7', 'take-and-hold'] } },
  'Black Templars': {
    catalogueId: '36d3-36bc-68dd-40ac',
    detachments: { "Marshal's Household": ['e533-c51a-5949-a579', 'priority-assets'] },
  },
  Deathwatch: { catalogueId: 'f89b-84e0-6e3b-f1e2', detachments: { 'Black Spear Task Force': ['4459-12f0-bc-142b', 'priority-assets'] } },
  Drukhari: { catalogueId: '38de-521f-1ce0-44a0', detachments: { 'Covenite Coterie': ['47c7-52f9-c23d-1e4e', 'take-and-hold'] } },
  'Leagues of Votann': { catalogueId: 'f616-3f08-ee8e-3349', detachments: { Hearthband: ['1077-70a1-0570-5685', 'priority-assets'] } },
  Orks: { catalogueId: 'a55f-b7b3-6c65-a05f', detachments: { 'War Horde': ['496c-ddb9-3e71-e0b3', 'take-and-hold'] } },
  "T'au Empire": { catalogueId: 'd81a-61dd-6d27-a3ce', detachments: { 'Retaliation Cadre': ['3bae-cf7-b9e3-4f00', 'purge-the-foe'] } },
} as const satisfies Record<string, { catalogueId: string; detachments: Record<string, readonly [string, string]> }>

export type Army = keyof typeof ARMIES

/**
 * Saves a roster straight into the signed-in player's account, as the roster setup would at their default visibility
 * and battle size, and opens it in the builder: for tests that need a roster, not the setup that makes one.
 */
export async function seededRoster(
  page: Page,
  {
    faction,
    detachment,
    name = `${faction} roster`,
    picks = [],
    limit,
  }: { faction: Army; detachment: string; name?: string; picks?: readonly RosterPick[]; limit?: number },
) {
  const army: { catalogueId: string; detachments: Record<string, readonly [string, string]> } = ARMIES[faction]
  const chosen = army.detachments[detachment]
  if (!chosen) throw new Error(`No ${faction} Detachment named ${detachment} is listed for seeding.`)
  const session = (await (await page.request.get('/api/auth/get-session')).json()) as { user: { id: string; email: string } } | null
  if (!session) throw new Error('The page must be signed in.')
  const { user } = session
  const operator = await productOperator()
  const defaults = await operator.playerDefaults(user.id)
  const { id } = await seedRoster(user.email, {
    name,
    automaticName: false,
    catalogueId: army.catalogueId,
    detachmentId: JSON.stringify([chosen[0]]),
    disposition: chosen[1],
    limit: limit ?? defaults.battleSize,
    picks: JSON.stringify(picks),
    visibility: defaults.rosterVisibility,
  })
  await page.goto(`/rosters/${id}`)
  // The page checks the medals the new roster earned and toasts them, as the setup's page would before its reload.
  await expect
    .poll(async () => {
      const status = await operator.achievementStatus(user.id)
      return status.checked === status.revision && status.earned.every((achievement) => achievement.seen)
    })
    .toBe(true)
  if (await page.getByText(/^Achievement earned: /).count()) await page.reload()
  await openedInBuilder(page, name)
  return name
}

/** A battle's own page, as opposed to the battles list or a join link. */
export const BATTLE_PAGE = /\/battles\/(?!join\/)[^/?#]+$/

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The signed-in player's account name, read from the account menu. */
export async function accountName(page: Page) {
  const label = await page.locator('button[aria-label^="Account menu for "]').first().getAttribute('aria-label')
  if (!label) throw new Error('The page must be signed in.')
  return label.replace('Account menu for ', '')
}

/** Opens setup on a fresh draft from the battles page, with only this player at the table. */
export async function newBattle(page: Page) {
  await page.goto('/battles')
  await expect(async () => {
    if (BATTLE_PAGE.test(new URL(page.url()).pathname)) return
    await page.getByRole('button', { name: 'New battle', exact: true }).first().click({ timeout: 1_000 })
    await page.waitForURL(BATTLE_PAGE, { timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /^Set up the battle/ })).toBeVisible()
  return page.url()
}

/** Opens a setup step that collapsed once the table settled it, and keeps it open until the page reloads. */
export async function expandStep(page: Page, id: string) {
  const expand = page.locator(`#setup-${id}`).getByRole('button', { name: /^Expand / })
  if (await expand.isVisible()) await expand.click()
}

/** Sets the Tracking step, Guided from the start, and waits for the Opponent step to open. */
export async function chooseTracking(page: Page, tracking: 'Guided' | 'Manual' = 'Guided') {
  await expandStep(page, 'format')
  const choice = page.locator('#setup-format').getByRole('group', { name: 'How you track it' })
  const button = choice.getByRole('button', { name: new RegExp(`^${tracking}`) })
  const opponentStep = page.locator('#setup-opponent')
  await expect(async () => {
    if ((await opponentStep.getAttribute('data-locked')) === 'false' && (await button.getAttribute('aria-pressed')) === 'true') return
    await button.click({ timeout: 1_000 })
    await expect(opponentStep).toHaveAttribute('data-locked', 'false', { timeout: 3_000 })
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
}

/** Shares the battle's link from the Opponent step and returns it. */
export async function shareBattleLink(page: Page) {
  const step = page.locator('#setup-opponent')
  const link = step.locator('p.font-mono')
  await expect(async () => {
    if (/^https?:/.test((await link.textContent({ timeout: 500 }).catch(() => '')) ?? '')) return
    await step.getByRole('button', { name: 'Show the QR code and link' }).click({ timeout: 1_000 })
    await expect(link).toHaveText(/^https?:/, { timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  return (await link.textContent())!.trim()
}

/** Opens a battle's link and joins it on `side`, choosing it where both sides have an open place. */
export async function joinBattle(page: Page, link: string, side: 0 | 1) {
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Join the battle' })).toBeVisible()
  const place = page
    .locator(`[data-join-side="${side}"]`)
    .getByRole('button')
    .filter({ hasText: /^(Open|You)$/ })
    .first()
  await expect(async () => {
    if (BATTLE_PAGE.test(new URL(page.url()).pathname)) return
    if ((await place.isEnabled()) && (await place.getAttribute('aria-pressed')) !== 'true') await place.click({ timeout: 1_000 })
    await page.getByRole('button', { name: 'Join the battle', exact: true }).click({ timeout: 1_000 })
    await page.waitForURL(BATTLE_PAGE, { timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
}

/** Adds an ally place to a side from its face-off card: an empty one, or one of their own for a player playing every side. */
export async function addAllyPlace(page: Page, side: 0 | 1) {
  const card = page.locator(`[data-face-off-side="${side}"]`)
  const add = card.getByRole('button', { name: 'Add ally' })
  const playingAll = await page.locator('[data-face-off-side="1"]').getByText('Played by you').first().isVisible()
  // A side of two takes no more, so the button goes once the place is there, whoever fills it.
  await expect(async () => {
    if (!(await add.isVisible())) return
    await add.click({ timeout: 1_000 })
    await expect(add).toBeHidden({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  if (playingAll) await expect(card.locator('[data-open-place]')).toHaveCount(0, { timeout: 15_000 })
}

/** Has this player play every side themselves, which fills every open place with one of their own. */
export async function playBothSides(page: Page) {
  const step = page.locator('#setup-opponent')
  const seated = page.locator('[data-face-off-side="1"]').getByText('Played by you')
  await expect(async () => {
    if (await seated.isVisible()) return
    await step.getByRole('button', { name: /^Play both sides/ }).click({ timeout: 1_000 })
    await expect(seated).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
}

/**
 * Opens a battle on a fresh draft, Guided unless `manual`, and fills its places: with the opener's own, or with
 * the players whose pages are given, who join through the shared link. The opener sits on the first side;
 * `yourAlly` joins them there, and `opponent`, `ally` and `secondOpponent` take the other side.
 */
export async function createBattle(
  page: Page,
  {
    opponent,
    ally,
    yourAlly,
    secondOpponent,
    practice = false,
    manual = false,
  }: {
    opponent?: Page
    ally?: Page
    yourAlly?: Page
    secondOpponent?: Page
    practice?: boolean
    manual?: boolean
  } = {},
) {
  const url = await newBattle(page)
  await chooseTracking(page, manual ? 'Manual' : 'Guided')
  if (practice) await playBothSides(page)
  if (yourAlly) await addAllyPlace(page, 0)
  if (ally || secondOpponent) await addAllyPlace(page, 1)
  const joiners = [
    ...(yourAlly ? [{ player: yourAlly, side: 0 as const }] : []),
    ...[opponent, ally, secondOpponent].flatMap((player) => (player ? [{ player, side: 1 as const }] : [])),
  ]
  if (joiners.length) {
    const link = await shareBattleLink(page)
    for (const { player, side } of joiners) await joinBattle(player, link, side)
  }
  return url
}

/**
 * Opens a battle the player plays alone with the roster on both sides, or another roster across the table. The other
 * side is then named after its roster.
 */
export async function practiceBattle(page: Page, roster: string, { opponentRoster = roster }: { opponentRoster?: string } = {}) {
  const url = await createBattle(page, { practice: true })
  await attachRoster(page, roster)
  await attachRoster(page, opponentRoster, { side: 1 })
  return url
}

/**
 * Presses a choice until the shared answer shows it, unless the table has already answered
 * or the battle does not play the step that asks it.
 */
async function pressUntilChosen(choice: Locator, button: Locator) {
  const chosen = async () => !(await choice.isVisible()) || (await choice.locator('button[aria-pressed="true"]').count()) > 0
  await expect(async () => {
    if (await chosen()) return
    await button.click({ timeout: 1_000 })
    await expect.poll(chosen, { timeout: 1_000 }).toBe(true)
  }).toPass({ timeout: 20_000 })
}

/** Tests that are not about deployment order use the first side as the defender, unless one was chosen. */
async function chooseDefender(page: Page) {
  const choice = page.getByRole('group', { name: 'Defender', exact: true })
  await pressUntilChosen(choice, choice.getByRole('button').first())
}

/** Sides whose armies offer several Force Dispositions and name none play the first one offered. */
async function settleDispositions(page: Page) {
  const asked = page.getByRole('group', { name: /^Force Disposition for / })
  for (let at = 0; at < (await asked.count()); at += 1) {
    const group = asked.nth(at)
    const first = group.getByRole('button').first()
    if (await first.isEnabled()) await pressUntilChosen(group, first)
  }
}

/** Records the first-turn roll-off, and a defender if nobody has, the last answers setup asks for before Start battle. */
export async function recordFirstTurn(page: Page, firstSide?: string) {
  await chooseDefender(page)
  const step = page.locator('#setup-first-turn')
  const choice = page.getByRole('group', { name: 'First turn' })
  const recorded = async () => {
    if ((await step.getAttribute('data-complete')) !== 'true') return false
    if (!firstSide) return true
    await expandStep(page, 'first-turn')
    return choice.getByRole('button', { name: firstSide, pressed: true }).isVisible()
  }
  await expect(async () => {
    if (await recorded()) return
    await setupStep(page, 'First turn')
    await (firstSide ? choice.getByRole('button', { name: firstSide }) : choice.getByRole('button').first()).click({ timeout: 1_000 })
    await expect.poll(recorded, { timeout: 1_000 }).toBe(true)
  }).toPass({ timeout: 20_000 })
}

/** Brings a setup step into view, expanded even when settled, which keeps it open until the page reloads. */
export async function setupStep(page: Page, label: string | RegExp) {
  const section = page.getByRole('region', { name: label, exact: true })
  // A phone restores the tab's remembered scroll for a few seconds after a page opens, and only a player's own input stops it.
  await expect(async () => {
    await section.scrollIntoViewIfNeeded()
    await expect(section).toBeInViewport({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  const expand = section.getByRole('button', { name: /^Expand / })
  if (await expand.isVisible()) await expand.click()
}

/**
 * Attaches a saved list to an army from its face-off card: your own by default, a named player's, or the first one
 * still without a list on `side`, such as a place you play yourself, which is named after its list once it has one.
 */
export async function attachRoster(page: Page, name: string, { forPlayer, side }: { forPlayer?: string; side?: 0 | 1 } = {}) {
  const player = side === undefined ? (forPlayer ?? (await accountName(page))) : undefined
  const card =
    player === undefined ? page.locator(`[data-face-off-side="${side}"]`) : page.locator('[data-face-off-side]').filter({ hasText: player })
  const named = player === undefined ? '.+’s army' : `${escapeRegExp(player)}’s army|Change roster for ${escapeRegExp(player)}`
  const chooser = card.getByRole('button', { name: new RegExp(`^(Choose army|Choose ${named})$`) })
  const attached = card.getByText(name, { exact: true }).first()
  const dialog = page.getByRole('dialog', { name: /roster$/ })
  const choice = dialog.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}\\b`) })
  // Every choice stays disabled until the server answers, which can outlast a short wait on a
  // loaded runner; a stale shared setup redraws and leaves the chooser open to press again.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      if (await attached.isVisible()) return
      // Dispatched rather than pressed: a guide's popover can hang over the face-off.
      await chooser.first().dispatchEvent('click', undefined, { timeout: 1_000 })
    }
    await choice.click({ timeout: 5_000 })
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await expect(attached).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  await expect(dialog).toBeHidden()
}

export async function chooseBattlefield(page: Page) {
  const battlefieldStep = page.locator('#setup-battlefield')
  if ((await battlefieldStep.getAttribute('data-complete')) === 'true') return
  await settleDispositions(page)
  await setupStep(page, 'Battlefield')
  // By position, not by name: which layouts a matchup offers follows the pinned rules data.
  // A choice that loses a race with the other device redraws without it, so press again.
  await expect(async () => {
    if ((await battlefieldStep.getAttribute('data-complete')) === 'true') return
    await page
      .getByRole('button', { name: /^Select layout / })
      .first()
      .click({ timeout: 2_000 })
    await expect(battlefieldStep).toHaveAttribute('data-complete', 'true', { timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
}

/** The button that ends the current phase or passes the turn. */
export const advanceButton = (page: Page) => page.getByRole('button', { name: /^(End the .+ phase|Pass the turn)$/ })

/** Confirms a scoring prompt, first answering every card the test left untouched with nothing scored. */
export async function confirmScoring(prompt: Locator, name: string | RegExp) {
  await expect(prompt.locator('section[data-due]').first()).toBeVisible()
  // Every card is listed once up front: a list filtered on the answer shrinks as each is answered.
  for (const card of await prompt.locator('section[data-due]').all()) {
    if ((await card.getAttribute('data-answered')) === null) await card.getByRole('button', { name: / scored nothing$/ }).click()
  }
  await prompt.getByRole('button', { name }).click()
}

/** The hand being dealt: this table's own, or that of a side it is also playing. */
export const drawPrompt = (page: Page) => page.getByRole('dialog', { name: /secondary missions$/ })
/** What the turn the other side just finished owed this one, asked as the turn arrives. */
const owedPrompt = (page: Page) => page.getByRole('dialog', { name: /^Scoring end of (their turn|battle)/ })

async function dismissBattleReminder(page: Page) {
  const reminder = page.getByRole('dialog', { name: /^Battle reminders?$/ })
  if (!(await reminder.isVisible().catch(() => false))) return false
  await reminder.getByRole('button', { name: /^(Dismiss|End the phase|Continue to end of turn)$/ }).click()
  await expect(reminder).toBeHidden()
  return true
}

async function clearDrawPrompt(prompt: Locator) {
  const done = prompt.getByRole('button', { name: 'Take the turn' })
  const mustReturn = prompt
    .locator('[data-drawn]')
    .filter({ hasText: /You must put this back/ })
    .getByRole('button', {
      name: 'Put back and draw another',
    })
  const enabled = async (button: Locator) => (await button.count()) > 0 && (await button.isEnabled({ timeout: 100 }).catch(() => false))
  for (let guard = 0; guard < 20; guard += 1) {
    const select = prompt.getByRole('button', { name: 'Select missions', exact: true })
    let action = 'waiting'
    await expect
      .poll(
        async () => {
          action = (await enabled(done))
            ? 'done'
            : (await enabled(select))
              ? 'select'
              : (await enabled(mustReturn.first()))
                ? 'return'
                : 'waiting'
          return action
        },
        { timeout: 15_000 },
      )
      .not.toBe('waiting')
    if (action === 'done') {
      await done.click({ timeout: 15_000 })
      await expect(prompt).toBeHidden()
      return
    }
    if (action === 'select') {
      await select.click()
      await selectOrdinaryMissions(prompt)
      await prompt.getByRole('button', { name: 'Add selected missions', exact: true }).click()
    } else await mustReturn.first().click({ timeout: 15_000 })
  }
  throw new Error('secondary redraws did not settle')
}

export async function selectOrdinaryMissions(prompt: Locator) {
  const add = prompt.getByRole('button', { name: 'Add selected missions', exact: true })
  const available = prompt.getByRole('button', { name: /^Select (?!A Tempting Target$|Burden Of Trust$)/i })
  for (let count = 0; count < 6; count++) {
    if (await add.isEnabled()) return
    await available.first().click()
  }
  throw new Error('Not enough ordinary mission cards for this test hand')
}

/**
 * Clears whatever a turn opens with: what their turn owed, and the hand this one deals.
 * Compact prompts leave the board accessible; journeys expecting a particular
 * settlement must wait for that prompt before calling this helper.
 */
/**
 * Skips the optional mission choices a random hand or a marker primary can open, which a test about something else
 * meets by chance; tests about a choice answer it themselves before calling a turn helper.
 */
export async function skipMissionChoices(page: Page) {
  const choice = page.getByRole('dialog', { name: / · choices$/ })
  for (let guard = 0; guard < 5 && (await choice.isVisible()); guard += 1) {
    const name = await choice.getAttribute('aria-labelledby')
    await choice.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect.poll(async () => (await choice.isVisible()) && (await choice.getAttribute('aria-labelledby')) === name).toBe(false)
  }
}

export async function takeTheTurn(page: Page) {
  for (let guard = 0; guard < 3; guard += 1) {
    const seen = await Promise.race([
      owedPrompt(page)
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => 'owed'),
      drawPrompt(page)
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => 'drawn'),
      // A reminder or mission choice is modal, hiding the board's buttons until the caller answers it. A page that has
      // not yet heard the other side pass still shows their end phase, whose button would pass a turn already passed.
      page
        .locator('[data-scoreboard] h1', { hasNotText: /^end/ })
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() =>
          advanceButton(page)
            .or(page.getByRole('dialog', { name: /^Battle reminders?$| · choices$/ }))
            .first()
            .waitFor({ state: 'visible', timeout: 8_000 }),
        )
        .then(() => 'board'),
    ]).catch(() => 'board')
    if (seen === 'board') return skipMissionChoices(page)
    const prompt = seen === 'owed' ? owedPrompt(page) : drawPrompt(page)
    if (seen === 'drawn') await clearDrawPrompt(prompt)
    else {
      await confirmScoring(prompt, /^(Take the turn|Finish battle)$/)
      await expect(prompt).toBeHidden()
    }
  }
}

/**
 * Ends the current phase, clearing whatever stands in front of it.
 *
 * A tactical hand is dealt as a turn opens, a personal reminder can appear at a
 * phase boundary, and a card that pays at the end of the phase or turn asks for
 * its points as that moment passes. Each blocks the board until it is answered,
 * while application navigation remains available on compact screens.
 */
export async function advance(
  page: Page,
  { dismissReminders = true, keepChoices = false }: { dismissReminders?: boolean; keepChoices?: boolean } = {},
) {
  const reminder = page.getByRole('dialog', { name: /^Battle reminders?$/ })
  for (let guard = 0; guard < 3; guard += 1) {
    if (dismissReminders && (await dismissBattleReminder(page))) continue
    if (!keepChoices) await skipMissionChoices(page)
    for (const [kind, prompt] of [
      ['owed', owedPrompt(page)],
      ['draw', drawPrompt(page)],
    ] as const) {
      if (!(await prompt.isVisible().catch(() => false))) continue
      if (kind === 'draw') await clearDrawPrompt(prompt)
      else {
        await confirmScoring(prompt, /^(Take the turn|Finish battle)$/)
        await expect(prompt).toBeHidden()
      }
    }
    const phase = page.locator('[data-scoreboard] h1')
    const before = await phase.textContent()
    // The button stays disabled until the last command lands, and a prompt opening instead hides it.
    const ready = advanceButton(page).and(page.locator(':enabled'))
    await expect(ready.or(reminder).or(owedPrompt(page)).or(drawPrompt(page)).first()).toBeVisible()
    // A prompt opening as the turn starts can cover the button; giving up quickly lets the next pass answer it.
    const clicked =
      (await ready.isVisible()) &&
      (await ready
        .click({ timeout: 2_000 })
        .then(() => true)
        .catch(() => false))
    if (clicked) {
      const scoring = page.getByRole('dialog', { name: /^Scoring end of (turn|command|movement|shooting|charge|fight) / })
      const discard = page.getByRole('dialog', { name: 'Discard tactical secondaries?' })
      const owed = owedPrompt(page)
      for (let promptGuard = 0; promptGuard < 8; promptGuard += 1) {
        await expect
          .poll(async () =>
            dismissReminders && (await reminder.isVisible().catch(() => false))
              ? 'reminder'
              : (await scoring.isVisible().catch(() => false))
                ? 'scoring'
                : (await discard.isVisible().catch(() => false))
                  ? 'discard'
                  : (await owed.isVisible().catch(() => false))
                    ? 'owed'
                    : (await phase.textContent()) === before
                      ? 'waiting'
                      : 'advanced',
          )
          .not.toBe('waiting')
        if ((await phase.textContent()) !== before) break
        if (dismissReminders && (await dismissBattleReminder(page))) continue
        if (await scoring.isVisible().catch(() => false)) {
          await confirmScoring(scoring, /^(Pass the turn|End the phase)$/)
          await expect(scoring).toBeHidden()
          continue
        }
        if (await discard.isVisible().catch(() => false)) {
          await discard.getByRole('button', { name: 'Keep hand' }).click()
          await expect(discard).toBeHidden()
          continue
        }
        await confirmScoring(owed, /^(Take the turn|Finish battle)$/)
        await expect(owed).toBeHidden()
      }
      await expect.poll(() => phase.textContent()).not.toBe(before)
      if (!keepChoices) await skipMissionChoices(page)
      break
    }
    if (guard === 2) throw new Error('Never reached the button that ends the phase')
  }
}

export const scoreboard = (page: Page) => page.getByRole('region', { name: 'Battle scoreboard' })

export const playerPanel = (scope: Page | Locator, side: 0 | 1) => scope.locator(`[data-panel="player"][data-side="${side}"]`)

/** Concedes the open battle from its options menu, reopening the menu until it shows: a press before hydration opens nothing. */
export async function concede(page: Page) {
  const choice = page.getByRole('menuitem', { name: 'Concede battle', exact: true })
  await retryUntilVisible(choice, () => page.getByRole('button', { name: 'Battle options', exact: true }).click())
  await choice.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Concede battle', exact: true }).click()
}

/** Ends all six phases of the current turn. */
export async function playTurn(page: Page) {
  for (let phase = 0; phase < PHASES.length; phase += 1) await advance(page)
}

export async function startBattle(page: Page, firstSide?: string, takeOpeningTurn = true, openingSecondaries: readonly string[] = []) {
  await chooseBattlefield(page)
  await setupStep(page, 'Secondaries')
  // One per side this table settles cards for, so every one of them has to be ready. A phone
  // shows one side of the step at a time, so the hand only has to be there.
  await expect(page.locator('[data-secondary-deck-ready]').first()).toBeAttached()
  await expect(page.locator('[data-secondary-deck-ready="false"]')).toHaveCount(0)
  await recordFirstTurn(page, firstSide)
  await page.getByRole('button', { name: 'Start battle' }).click()
  // The hand is dealt over the board, and a modal hides the board from the accessibility
  // tree, so the prompt has to be cleared before the phase can be read.
  await expect(
    page
      .getByRole('dialog', { name: /secondary missions$/ })
      .or(page.getByRole('heading', { name: 'command phase' }))
      .first(),
  ).toBeVisible()
  if (takeOpeningTurn) {
    if (openingSecondaries.length) {
      const prompt = page.getByRole('dialog', { name: /secondary missions$/ })
      await prompt.getByRole('button', { name: 'Select missions' }).click()
      for (const card of openingSecondaries) await prompt.getByRole('button', { name: `Select ${card}`, exact: true }).click()
      await prompt.getByRole('button', { name: 'Add selected missions' }).click()
      await expect(prompt.locator('[data-drawn]')).toHaveCount(openingSecondaries.length)
      await expect(prompt.getByRole('button', { name: 'Draw at random' })).toBeHidden()
    }
    await takeTheTurn(page)
    await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
  }
}

/** A visitor's Necrons roster, left open in the builder. */
export async function startVisitorRoster(page: Page) {
  const setup = await visitorSetup(page)
  await chooseFaction(setup, 'Necrons')
  await setup.getByRole('button', { name: /^Select (?:Awakened Dynasty)$/ }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Create roster' }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)
}

/** Two new players with a roster each, the first Death Guard and the second Necrons. */
export async function rosteredPlayers(alice: Page, bob: Page) {
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')
  await signUp(bob, bobName)
  const bobRoster = await seededRoster(bob, { faction: 'Necrons', detachment: 'Awakened Dynasty', name: 'Necrons' })
  await signUp(alice, aliceName)
  const aliceRoster = await seededRoster(alice, { faction: 'Death Guard', detachment: 'Shamblerot Vectorium', name: 'Death Guard' })
  return { aliceName, bobName, aliceRoster, bobRoster }
}

/** Two new players, the first hosting Necrons against the second's Death Guard. */
export async function twoPlayerBattle(alice: Page, bob: Page) {
  const aliceName = uniqueName('Alice')
  const bobName = uniqueName('Bob')
  await signUp(bob, bobName)
  const bobRoster = await seededRoster(bob, { faction: 'Death Guard', detachment: 'Shamblerot Vectorium', name: 'Death Guard' })
  await signUp(alice, aliceName)
  const aliceRoster = await seededRoster(alice, { faction: 'Necrons', detachment: 'Awakened Dynasty', name: 'Necrons' })
  const link = await setupBattle(alice, bob, { hostRoster: aliceRoster, guestRoster: bobRoster })
  return { aliceName, bobName, link }
}

export async function setupBattle(
  host: Page,
  guest: Page,
  {
    hostRoster,
    guestRoster,
    beforeStart,
    openingSecondaries,
  }: {
    hostRoster: string
    guestRoster: string
    beforeStart?: () => Promise<void>
    openingSecondaries?: readonly string[]
  },
) {
  const url = await createBattle(host, { opponent: guest })
  await attachRoster(host, hostRoster)
  await expect(guest.getByText(hostRoster, { exact: true }).first()).toBeVisible()
  await attachRoster(guest, guestRoster)
  await expect(host.getByText(guestRoster, { exact: true }).first()).toBeVisible()
  // Cards are chosen while the battle is still being set up, not once it is running.
  if (beforeStart) {
    await chooseBattlefield(host)
    await setupStep(host, 'Secondaries')
    await beforeStart()
  }
  await startBattle(host, undefined, true, openingSecondaries)
  await expect(guest.getByRole('heading', { name: 'command phase' })).toBeVisible()
  return url
}

export async function confirmRosterSetup(dialog: Locator) {
  await dialog.getByRole('button', { name: /^(Review changes|Convert roster)$/ }).click()
  const review = dialog.page().getByRole('dialog', { name: 'Review roster changes' })
  await expect(review.getByLabel('Roster change preview')).toBeVisible()
  await review.getByRole('button', { name: 'Confirm changes', exact: true }).click()
  await expect(review).toBeHidden()
}

export async function scrollSearchResultIntoView(page: Page, result: Locator) {
  const scroller = page
    .getByRole('dialog')
    .isVisible()
    .then((open) => (open ? page.getByRole('listbox', { name: 'Search results' }) : page.getByRole('region', { name: 'Search results' })))
  const list = await scroller
  await expect(async () => {
    if (!(await result.isVisible()))
      // The results share one scrolling area with whatever leads them.
      await list.evaluate((element) => {
        element.parentElement!.scrollTop += element.parentElement!.clientHeight / 2
      })
    await expect(result).toBeVisible({ timeout: 100 })
    // Device results are replaced by the server's, so a result can leave the list mid-scroll.
    await result.scrollIntoViewIfNeeded({ timeout: 100 })
    await expect(result).toBeInViewport({ timeout: 100 })
  }).toPass({ timeout: 15000 })
}

/**
 * Opens a combobox and picks one of its options, reopening it if hydration swallowed the first press. Waits for the
 * list to close, so a next pick from a list offering the same option cannot land on this one as it leaves.
 */
export async function chooseOption(page: Page, control: string, name: string | RegExp) {
  const option = page.getByRole('option', { name, exact: true })
  const combobox = page.getByRole('combobox', { name: control, exact: true })
  // A retry pressing a list that opened late would close it again.
  await retryUntilVisible(option, async () => {
    if ((await combobox.getAttribute('aria-expanded')) !== 'true') await combobox.click()
  })
  await option.click()
  await expect(option).toBeHidden()
}

/** Moves an open roster setup to another rules version on the given detachment, removing whatever that version lacks. */
export async function chooseRulesVersion(setup: Locator, rules: string, detachment: string) {
  await chooseOption(setup.page(), 'Rules version', rules)
  const select = setup.getByRole('button', { name: `Select ${detachment}`, exact: true })
  await expect(select).toBeVisible()
  const unavailable = setup.getByRole('button', { name: 'Remove unavailable', exact: true })
  if (await unavailable.isVisible()) await unavailable.click()
  if (!(await setup.getByRole('button', { name: `Select ${detachment}`, exact: true, pressed: true }).isVisible())) await select.click()
  const dispositions = setup.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
}

export async function openRosterSetup(page: Page) {
  await chooseRosterAction(page, 'Edit roster setup')
  return page.getByRole('dialog', { name: 'Edit roster setup' })
}

/** Changes who can open the roster and waits until the saved roster says so. */
export async function setRosterAccess(page: Page, name: string, value: string) {
  const setup = await openRosterSetup(page)
  await setup.getByRole('combobox', { name: 'Access' }).click()
  await page.getByRole('option', { name }).click()
  await waitForRosterSave(page, () => confirmRosterSetup(setup), `"${value}"`)
}

export const PHONE = { width: 390, height: 844 }

/** Saves the page at desktop and phone widths, checking neither scrolls sideways. */
export async function shotAtWidths(page: Page, name: string, { fullPage = false } = {}) {
  const before = page.viewportSize()!
  for (const [label, size] of [
    ['desktop', { width: 1280, height: 900 }],
    ['phone', PHONE],
  ] as const) {
    await page.setViewportSize(size)
    await expectNoPageOverflow(page)
    await screenshot(page, `${name}-${label}.png`, { fullPage })
  }
  await page.setViewportSize(before)
}

/** The page is no wider than its viewport; a failure shows by how much it overflows. */
export async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
}

/**
 * No rendered element the locator matches scrolls sideways, allowing a pixel of subpixel rounding. A closed details
 * skips layout, so its content keeps the geometry of whatever width the page last laid it out at.
 */
export async function expectNoHorizontalOverflow(scope: Locator) {
  expect(
    await scope.evaluateAll((elements) =>
      elements.every((element) => !element.checkVisibility() || element.scrollWidth <= element.clientWidth + 1),
    ),
  ).toBe(true)
}

const NECRON_UNITS = { Immortals: '821d-665-499f-e895', 'Lokhust Destroyers': 'd8f0-1727-fcdd-7ee9' }

/** The smallest Necrons list an event will seal, a Skorpekh Lord as its Warlord, opened in the builder, and its roster id. */
export async function sealableRoster(
  page: Page,
  name: string,
  { limit, extraUnit }: { limit?: number; extraUnit?: keyof typeof NECRON_UNITS } = {},
) {
  const skorpekhLord = { entryId: '6733-60f-2fbe-e3bd', toggles: { '6f49-3919-b28c-3c0d': 1 } }
  await seededRoster(page, {
    faction: 'Necrons',
    detachment: 'Cursed Legion',
    name,
    limit,
    picks: [skorpekhLord, ...(extraUnit ? [{ entryId: NECRON_UNITS[extraUnit] }] : [])],
  })
  return lastPathSegment(page.url())
}

/** The first eligible character a list adds is its Warlord already, so only another one needs choosing. */
export async function makeWarlord(page: Page, unit: string) {
  const make = page.getByRole('button', { name: `Make ${unit} Warlord`, exact: true })
  const held = page.getByRole('button', { name: `Remove ${unit} Warlord`, exact: true })
  await expect(make.or(held)).toBeVisible()
  if (await make.isVisible()) await make.click()
  await expect(held).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-roster-builder]')).toHaveAttribute('data-saving', 'false')
  // The builder may crown the unit itself and syncs saves in the background, so an idle builder does not yet mean the
  // saved roster a seal or battle reads holds the Warlord.
  const id = new URL(page.url()).pathname.match(/^\/rosters\/([^/]+)$/)?.[1]
  if (!id) return
  const product = await productOperator()
  await expect
    .poll(async () => /"toggles":\{[^}]*:1/.test((await product.roster(id))?.picks ?? ''), { message: `${unit} is the saved Warlord` })
    .toBe(true)
}

/** Waits two frames, long enough for a layout change to paint. */
export const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

/**
 * Moves the timeline to its first event once the page answers keys.
 *
 * A key pressed before hydration moves only the native input, which then already sits
 * at its minimum, so End comes first to give Home a change to report.
 */
export async function rewind(slider: Locator) {
  await expect(async () => {
    await slider.press('End')
    await slider.press('Home')
    await expect(slider).toHaveAttribute('aria-valuetext', /^Setup,/, { timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
}

function decodeBase32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = value
    .split('')
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('')
  return Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [])
}

/** The authenticator code an app scanning `uri` would show now. */
export function currentTotp(uri: string) {
  const secret = new URL(uri).searchParams.get('secret')
  if (!secret) throw new Error('The authenticator URI has no secret.')
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = digest.at(-1)! & 0x0f
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
}

/** Leaves only the layout's published distances on, the ones these counts were taken from. */
