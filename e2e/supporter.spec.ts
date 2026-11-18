import { expect, test, type Browser, type Page } from './test'
import { signUp, uniqueName } from './account'
import { userIdNamed, withAuthSql } from './storage'

/**
 * A player with a linked GitHub account that sponsors the project publicly.
 *
 * The sponsor row is what the refresh would store from GitHub; the test stack
 * has no sponsors token, so nothing replaces it while the test runs.
 */
async function linkedSponsor(page: Page) {
  const name = uniqueName('Sponsor')
  await signUp(page, name)
  const id = await userIdNamed(name)
  const githubId = crypto.randomUUID()
  return withAuthSql((database) => {
    const now = Date.now()
    database
      .prepare('INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), githubId, 'github', id, now, now)
    database.prepare('INSERT INTO githubSponsor (githubId, public) VALUES (?, ?)').run(githubId, 1)
    return id
  })
}

async function visitorProfile(browser: Browser, userId: string) {
  const visitor = await browser.newContext()
  const page = await visitor.newPage()
  await page.goto(`/users/${userId}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  return { page, close: () => visitor.close() }
}

test("a sponsor's profile shows the supporter badge to anyone only while the sponsorship is public", async ({ page, browser }) => {
  const userId = await linkedSponsor(page)
  const profile = await visitorProfile(browser, userId)
  try {
    await expect(profile.page.getByRole('link', { name: 'Supporter' })).toHaveAttribute(
      'href',
      'https://github.com/sponsors/richardsolomou',
    )
    await withAuthSql((database) =>
      database
        .prepare('UPDATE githubSponsor SET public = 0 WHERE githubId = (SELECT accountId FROM account WHERE userId = ? AND providerId = ?)')
        .run(userId, 'github'),
    )
    await profile.page.reload()
    await expect(profile.page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(profile.page.locator('[data-supporter-badge]')).toHaveCount(0)
  } finally {
    await profile.close()
  }
})
