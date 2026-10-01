import { expect, test, type Browser, type Page } from '@playwright/test'
import { signUp, uniqueName } from './account'
import { withAuthSql } from './storage'

/**
 * A player with a linked GitHub account that sponsors the project.
 *
 * The sponsor row is what the refresh would store from GitHub; the test stack
 * has no sponsors token, so nothing replaces it while the test runs.
 */
async function linkedSponsor(page: Page, sponsorship: 'public' | 'private') {
  const name = uniqueName('Sponsor')
  await signUp(page, name)
  const githubId = crypto.randomUUID()
  return withAuthSql((database) => {
    const { id } = database.prepare('SELECT id FROM user WHERE name = ? LIMIT 1').get(name) as { id: string }
    const now = Date.now()
    database
      .prepare('INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), githubId, 'github', id, now, now)
    database.prepare('INSERT INTO githubSponsor (githubId, public) VALUES (?, ?)').run(githubId, sponsorship === 'public' ? 1 : 0)
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

test("a public sponsor's profile shows the supporter badge to anyone", async ({ page, browser }) => {
  const profile = await visitorProfile(browser, await linkedSponsor(page, 'public'))
  try {
    await expect(profile.page.getByRole('link', { name: 'Supporter' })).toHaveAttribute(
      'href',
      'https://github.com/sponsors/richardsolomou',
    )
  } finally {
    await profile.close()
  }
})

test("a private sponsor's profile shows no supporter badge", async ({ page, browser }) => {
  const profile = await visitorProfile(browser, await linkedSponsor(page, 'private'))
  try {
    await expect(profile.page.locator('[data-supporter-badge]')).toHaveCount(0)
  } finally {
    await profile.close()
  }
})
