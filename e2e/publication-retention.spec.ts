import { expect, test, type Page } from './test'
import { z } from 'zod'
import {
  createBattle,
  createRoster,
  retryUntilVisible,
  setupBattle,
  signUp,
  startBattle,
  uniqueName,
  waitForRosterSave,
  sealableRoster,
  practiceBattle,
  concede,
  chooseLibraryAction,
  scoreboard,
} from './account'
import { battleCommands, productOperator, productSql, savedWork, withAuthSql, userIdNamed, lastPathSegment, battleIdFor } from './storage'

test.setTimeout(300_000)

const playedCount = (page: Page) => page.locator('[data-service-record] [data-record-battles]')

async function collectionAndFavourite(page: Page, userId: string) {
  await page.goto('/factions/necrons/datasheets/overlord')
  const menu = page.getByRole('dialog', { name: 'Add Overlord to', exact: true })
  await retryUntilVisible(menu, () => page.getByRole('button', { name: 'Add to', exact: true }).click())
  await menu.getByRole('button', { name: 'Add to collection', exact: true }).click()
  await expect(menu.getByRole('spinbutton', { name: 'Overlord models owned', exact: true })).toHaveValue('1')
  await menu.getByRole('button', { name: 'More Overlord models', exact: true }).click()
  await expect(menu.getByRole('spinbutton', { name: 'Overlord models owned', exact: true })).toHaveValue('2')
  await menu.getByRole('button', { name: 'Favourites', exact: true }).click()
  await expect(menu.getByRole('button', { name: 'Favourites', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  const product = await productOperator()
  await expect.poll(async () => (await product.collectionByUser(userId)).map((row) => row.models)).toEqual([2])
  const collection = await product.collectionByUser(userId)
  const entryId = collection[0]?.entryId
  if (!entryId) throw new Error('Missing saved collection datasheet')
  await expect.poll(async () => (await product.favouriteDatasheetsByUser(userId)).map((row) => row.entryId)).toEqual([entryId])
  return { entryId, collection, favourites: await product.favouriteDatasheetsByUser(userId) }
}

async function seedCollection(userId: string, entryId: string) {
  const product = await productOperator()
  await product.addToCollection({ userId, entryId, now: Date.now() })
  await product.setCollectionModels({ userId, entryId, models: 2, now: Date.now() })
  await product.addFavouriteDatasheet({ userId, entryId, now: Date.now() })
  return { collection: await product.collectionByUser(userId), favourites: await product.favouriteDatasheetsByUser(userId) }
}

async function leagueFixture(ownerId: string, members: string[]) {
  const product = await productOperator()
  const league = { id: crypto.randomUUID(), token: crypto.randomUUID(), eventId: crypto.randomUUID(), eventToken: crypto.randomUUID() }
  await product.leagueCommand(
    {
      op: 'create',
      ...league,
      ownerId,
      name: uniqueName('Retention league'),
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: null,
      format: '1v1',
      rosterLimit: 2_000,
      now: Date.now(),
    },
    z.null(),
  )
  for (const userId of members) {
    expect(
      await product.leagueCommand(
        { op: 'join', token: league.token, eventToken: league.eventToken, userId, memberLimit: 128, now: Date.now() },
        z.string(),
      ),
    ).toBe('accepted')
  }
  return league
}

async function sealThroughPage(page: Page, leagueToken: string, rosterName: string) {
  await page.goto(`/tournaments/${leagueToken}`)
  const chooser = page.getByRole('dialog', { name: 'Seal a roster' })
  await retryUntilVisible(chooser, () => page.getByRole('button', { name: 'Choose a roster', exact: true }).click())
  await chooser.locator(`[data-roster="${rosterName}"]`).click()
  await chooser.getByRole('button', { name: `Seal ${rosterName}`, exact: true }).click()
  await expect(chooser).toBeHidden()
}

async function concedeAndSync(page: Page) {
  await concede(page)
  await expect(scoreboard(page).getByRole('heading')).toContainText('wins by concession')
  // The scoreboard updates before the queued concession reaches the server.
  await expect.poll(async () => (await savedWork(page))?.operations.length ?? 0, { timeout: 60_000 }).toBe(0)
}

async function deleteBattle(page: Page, url: string) {
  await page.goto('/battles')
  const card = page.locator('article').filter({ has: page.locator(`a[href="${new URL(url).pathname}"]`) })
  const choice = page.getByRole('menuitem', { name: 'Delete battle', exact: true })
  await retryUntilVisible(choice, () => card.click({ button: 'right' }))
  await choice.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete battle', exact: true }).click()
  await expect(card).toHaveCount(0)
}

async function expectRecord(page: Page, userId: string, played: number) {
  await page.goto(`/users/${userId}`)
  const record = page.locator('[data-service-record]')
  if (!played) {
    // A player with public lists and no visible battle opens on their rosters, without a record to count.
    await expect(page.locator('[data-service-record], [data-player-rosters]').first()).toBeVisible()
    await expect(record.locator('[data-record-battles]')).toHaveCount(0)
  } else await expect(playedCount(page)).toHaveAttribute('data-record-battles', String(played))
}

test('saved roster deletion preserves its actual sealed and fielded copies until their containers are deleted', async ({ page }) => {
  const name = uniqueName('Retained copies')
  await signUp(page, name)
  const userId = await userIdNamed(name)
  const rosterName = uniqueName('Original frozen roster')
  const rosterId = await sealableRoster(page, rosterName)
  const rosterUrl = page.url()
  const league = await leagueFixture(userId, [userId])
  await sealThroughPage(page, league.token, rosterName)
  const sealedCopy = () =>
    productSql`SELECT roster_snapshot FROM league_event_entries WHERE event_id = ${league.eventId} AND user_id = ${userId}`
  const sealedBefore = await sealedCopy()
  expect(sealedBefore).toHaveLength(1)
  expect(z.tuple([z.literal(0), z.string()]).parse(sealedBefore[0]?.roster_snapshot)[1]).toContain('Skorpekh Lord')

  const battleUrl = await practiceBattle(page, rosterName)
  await startBattle(page)
  await concedeAndSync(page)
  const battleId = await battleIdFor(lastPathSegment(battleUrl))
  const commandsBefore = await battleCommands(battleId)
  expect(commandsBefore.some(({ body }) => JSON.stringify(body).includes('Skorpekh Lord'))).toBe(true)

  await page.goto(rosterUrl)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Changed saved roster'), 'Changed saved roster')
  await page.goto('/rosters')
  await chooseLibraryAction(page, 'Changed saved roster', 'Delete')
  const deletion = page.getByRole('alertdialog')
  await expect(deletion).toContainText('Frozen copies in battles and tournaments are kept')
  await deletion.getByRole('button', { name: 'Keep roster', exact: true }).click()
  expect(await productSql`SELECT id FROM rosters WHERE id = ${rosterId}`).toEqual([{ id: rosterId }])
  await chooseLibraryAction(page, 'Changed saved roster', 'Delete')
  await deletion.getByRole('button', { name: 'Delete roster', exact: true }).click()
  await expect.poll(() => productSql`SELECT id FROM rosters WHERE id = ${rosterId}`).toEqual([])
  expect(await battleCommands(battleId)).toEqual(commandsBefore)
  expect(await sealedCopy()).toEqual(sealedBefore)

  // Its owner still reads the sealed copy before the reveal, after the saved roster is gone.
  await page.goto(`/rosters/${userId}?league=${league.token}&event=${league.eventToken}`)
  await expect(page.locator('[data-unit="Skorpekh Lord"]')).toBeVisible()
  await page.goto(`/tournaments/${league.token}`)
  const viewSealed = page.getByRole('link', { name: `View ${name}’s roster`, exact: true })
  const reveal = page.getByRole('alertdialog', { name: 'Reveal every roster?' })
  await retryUntilVisible(reveal, () =>
    page.locator('[data-entry-status]').getByRole('button', { name: 'Reveal all rosters', exact: true }).click(),
  )
  await expect(viewSealed).toHaveCount(0)
  await reveal.getByRole('button', { name: 'Reveal all rosters', exact: true }).click()
  await expect(viewSealed).toBeVisible()
  const sealedUrl = await viewSealed.getAttribute('href')
  if (!sealedUrl) throw new Error('Missing revealed roster link')
  expect(await sealedCopy()).toEqual(sealedBefore)

  for (const [kind, url] of [
    ['fielded', `/rosters/${rosterId}?battle=${lastPathSegment(battleUrl)}`],
    ['sealed', sealedUrl],
  ] as const) {
    await page.goto(url)
    await page.reload()
    await expect(page.getByLabel('List name')).toHaveValue(rosterName)
    await expect(page.getByLabel('List name')).toHaveAttribute('readonly', '')
    await expect(page.locator('[data-unit="Skorpekh Lord"]')).toBeVisible()
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: test.info().outputPath(`retained-${kind}-${width}.png`) })
    }
  }
  await page.goto(`/tournaments/${league.token}`)
  const deleteLeague = page.getByRole('menuitem', { name: 'Delete tournament', exact: true })
  await retryUntilVisible(deleteLeague, () => page.getByRole('button', { name: /^More for Retention league-/ }).click())
  await deleteLeague.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete tournament', exact: true }).click()
  await expect.poll(() => productSql`SELECT id FROM tournaments WHERE id = ${league.id}`).toEqual([])
  expect(await productSql`SELECT id FROM sealed_events WHERE id = ${league.eventId}`).toEqual([])
  expect(await productSql`SELECT user_id FROM league_event_entries WHERE event_id = ${league.eventId}`).toEqual([])
  expect(await battleCommands(battleId)).toEqual(commandsBefore)
  await page.goto(sealedUrl)
  await expect(page.getByRole('heading', { name: 'Nothing here', exact: true })).toBeVisible()
  await page.goto(`/rosters/${rosterId}?battle=${lastPathSegment(battleUrl)}`)
  await expect(page.getByLabel('List name')).toHaveValue(rosterName)
  await deleteBattle(page, battleUrl)
  // The card leaves the list as soon as the deletion is saved on the device, before the server has it.
  await expect
    .poll(() =>
      Promise.all([
        productSql`SELECT seq FROM commands WHERE battle_id = ${battleId}`,
        productSql`SELECT user_id FROM battle_users WHERE battle_id = ${battleId}`,
      ]),
    )
    .toEqual([[], []])
  await page.goto(battleUrl)
  await expect(page.getByRole('heading', { name: 'Nothing here', exact: true })).toBeVisible()

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/terms')
    const content = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Your content', exact: true }) })
    const ending = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ending', exact: true }) })
    await content.screenshot({ path: test.info().outputPath(`retention-terms-${width}.png`) })
    await ending.screenshot({ path: test.info().outputPath(`deletion-terms-${width}.png`) })
    await content.getByRole('link', { name: 'privacy policy', exact: true }).click()
    await expect(page).toHaveURL('/privacy')
    const audiences = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Who can see your content', exact: true }) })
    await audiences.screenshot({ path: test.info().outputPath(`sealed-privacy-${width}.png`) })
  }
})

test('self-account deletion removes populated shared history and sealed entries while unrelated opponent content survives', async ({
  browser,
}) => {
  const ownerContext = await browser.newContext()
  const opponentContext = await browser.newContext()
  const anonymousContext = await browser.newContext()
  try {
    const owner = await ownerContext.newPage()
    const opponent = await opponentContext.newPage()
    const anonymous = await anonymousContext.newPage()
    const ownerName = uniqueName('Deleted participant')
    const opponentName = uniqueName('Surviving participant')
    await signUp(owner, ownerName)
    const ownerId = await userIdNamed(ownerName)
    const ownerRoster = uniqueName('Removed saved roster')
    const ownerRosterId = await sealableRoster(owner, ownerRoster)
    await signUp(opponent, opponentName)
    const opponentId = await userIdNamed(opponentName)
    // Take and Hold against the sealed list's Purge the Foe draws primaries that need no nominations.
    const opponentRoster = await createRoster(opponent, {
      faction: 'Necrons',
      detachment: /Awakened Dynasty/,
      name: uniqueName('Surviving roster'),
    })
    const opponentRosterId = lastPathSegment(opponent.url())
    const ownerCollection = await collectionAndFavourite(owner, ownerId)
    const opponentCollection = await seedCollection(opponentId, ownerCollection.entryId)
    const finished = await setupBattle(owner, opponent, { opponent: opponentName, hostRoster: ownerRoster, guestRoster: opponentRoster })
    await concedeAndSync(owner)
    const otherCreated = await createBattle(opponent, { opponent: ownerName })
    const unrelated = await createBattle(opponent, { practice: true })
    const ownLeague = await leagueFixture(ownerId, [ownerId])
    const otherLeague = await leagueFixture(opponentId, [ownerId, opponentId])
    await sealThroughPage(owner, ownLeague.token, ownerRoster)
    await sealThroughPage(owner, otherLeague.token, ownerRoster)
    const finishedId = await battleIdFor(lastPathSegment(finished))
    const otherId = await battleIdFor(lastPathSegment(otherCreated))
    expect(await productSql`SELECT user_id FROM battle_users WHERE user_id = ${ownerId}`).toHaveLength(2)
    expect(await productSql`SELECT user_id FROM league_event_entries WHERE user_id = ${ownerId}`).toHaveLength(2)
    await expectRecord(anonymous, ownerId, 1)
    await opponent.goto(finished)
    await expect(scoreboard(opponent).getByRole('heading')).toContainText('wins by concession')

    await owner.goto('/profile')
    const dialog = owner.getByRole('dialog', { name: 'Delete your account' })
    await retryUntilVisible(dialog, () => owner.getByRole('button', { name: 'Delete account', exact: true }).click())
    await owner.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(await productSql`SELECT id FROM rosters WHERE id = ${ownerRosterId}`).toEqual([{ id: ownerRosterId }])
    const product = await productOperator()
    expect(await product.collectionByUser(ownerId)).toEqual(ownerCollection.collection)
    expect(await product.favouriteDatasheetsByUser(ownerId)).toEqual(ownerCollection.favourites)
    await owner.getByRole('button', { name: 'Delete account', exact: true }).click()
    await dialog.getByLabel('Confirm your password').fill('incorrect-password')
    await dialog.getByLabel('I understand that my account and its battles cannot be recovered.').check()
    await dialog.getByRole('button', { name: 'Permanently delete account', exact: true }).click()
    await expect(dialog.getByText('The account was not deleted. Check your password and try again.', { exact: true })).toBeVisible()
    expect(await productSql`SELECT user_id FROM battle_users WHERE user_id = ${ownerId}`).toHaveLength(2)
    expect(await product.collectionByUser(ownerId)).toEqual(ownerCollection.collection)
    expect(await product.favouriteDatasheetsByUser(ownerId)).toEqual(ownerCollection.favourites)
    await dialog.getByLabel('Confirm your password').fill('a-long-enough-password')
    for (const width of [1440, 390]) {
      await owner.setViewportSize({ width, height: 900 })
      const contained = async () => {
        const bounds = await Promise.all([dialog.boundingBox(), dialog.locator('[data-slot="dialog-footer"]').boundingBox()])
        return bounds.every((box) => box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 900)
      }
      await expect.poll(contained).toBe(true)
      await expect(dialog.getByRole('button', { name: 'Permanently delete account', exact: true })).toBeInViewport()
    }
    await dialog.getByRole('button', { name: 'Permanently delete account', exact: true }).click()
    await owner.waitForURL('/')
    await expect(owner.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
    expect(await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE id = ?').all(ownerId))).toEqual([])
    expect(await productSql`SELECT id FROM rosters WHERE user_id = ${ownerId}`).toEqual([])
    expect(await productSql`SELECT entry_id FROM collection WHERE user_id = ${ownerId}`).toEqual([])
    expect(await productSql`SELECT entry_id FROM favourite_datasheets WHERE user_id = ${ownerId}`).toEqual([])
    expect(await product.collectionByUser(opponentId)).toEqual(opponentCollection.collection)
    expect(await product.favouriteDatasheetsByUser(opponentId)).toEqual(opponentCollection.favourites)
    expect(await productSql`SELECT user_id FROM battle_users WHERE user_id = ${ownerId}`).toEqual([])
    expect(await productSql`SELECT id FROM battles WHERE id = ${finishedId} OR id = ${otherId}`).toEqual([])
    expect(await productSql`SELECT seq FROM commands WHERE battle_id = ${finishedId} OR battle_id = ${otherId}`).toEqual([])
    expect(await productSql`SELECT id FROM tournaments WHERE owner_id = ${ownerId}`).toEqual([])
    expect(await productSql`SELECT id FROM sealed_events WHERE id = ${ownLeague.eventId}`).toEqual([])
    expect(await productSql`SELECT user_id FROM league_event_entries WHERE user_id = ${ownerId}`).toEqual([])
    expect(await productSql`SELECT id FROM rosters WHERE id = ${opponentRosterId}`).toEqual([{ id: opponentRosterId }])
    expect(await productSql`SELECT id FROM tournaments WHERE id = ${otherLeague.id}`).toEqual([{ id: otherLeague.id }])
    expect(await productSql`SELECT token FROM battles WHERE token = ${lastPathSegment(unrelated)}`).toEqual([
      { token: lastPathSegment(unrelated) },
    ])
    await expect(opponent).toHaveURL('/battles')
    await expect(opponent.locator(`a[href="${new URL(unrelated).pathname}"]`)).toBeVisible()
    for (const deleted of [finished, otherCreated]) {
      await expect(opponent.locator(`a[href="${new URL(deleted).pathname}"]`)).toHaveCount(0)
    }
    await opponent.goto(finished)
    await expect(opponent.getByRole('heading', { name: 'Nothing here', exact: true })).toBeVisible()
    await anonymous.reload()
    await expect(anonymous.getByRole('heading', { name: 'No such player' })).toBeVisible()
    await expectRecord(opponent, opponentId, 0)
    await opponent.goto(unrelated)
    await expect(opponent.getByRole('heading', { name: 'Set up the battle' })).toBeVisible()
  } finally {
    await Promise.all([ownerContext.close(), opponentContext.close(), anonymousContext.close()])
  }
})

test('saved public results leave cached rankings and viewer records after battle deletion', async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()))
  try {
    const [owner, opponent, anonymous] = await Promise.all(contexts.map((context) => context.newPage()))
    if (!owner || !opponent || !anonymous) throw new Error('Missing record test pages')
    const ownerName = uniqueName('Record owner')
    const opponentName = uniqueName('Record opponent')
    await signUp(owner, ownerName)
    const ownerId = await userIdNamed(ownerName)
    const hostRoster = await createRoster(owner, {
      faction: 'Necrons',
      detachment: /Awakened Dynasty/,
      name: uniqueName('Record host list'),
    })
    await signUp(opponent, opponentName)
    const guestRoster = await createRoster(opponent, {
      faction: 'Death Guard',
      detachment: /Shamblerot Vectorium/,
      name: uniqueName('Record guest list'),
    })
    const battle = await setupBattle(owner, opponent, { opponent: opponentName, hostRoster, guestRoster })
    await concedeAndSync(owner)
    await expectRecord(anonymous, ownerId, 1)
    const standing = anonymous.locator('[data-rankings] a').filter({ hasText: 'Everyone' })
    await expect(standing).toContainText('0% · 1 battle')
    await deleteBattle(owner, battle)
    await expect(standing).toHaveCount(0)
    await expectRecord(anonymous, ownerId, 0)
    await expectRecord(opponent, ownerId, 0)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
