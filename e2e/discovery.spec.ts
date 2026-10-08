import { expect, test } from '@playwright/test'

const pages = [
  { path: '/rosters', title: 'Warhammer 40,000 army builder' },
  { path: '/rosters?limit=1000&visibility=public', canonical: '/rosters', title: 'Warhammer 40,000 army builder' },
  { path: '/battles', title: 'Warhammer 40,000 battle tracker' },
  { path: '/leagues', title: 'Leagues' },
  { path: '/sources', title: 'Data sources' },
  { path: '/support', title: 'Support' },
  { path: '/privacy', title: 'Privacy policy' },
  { path: '/terms', title: 'Terms of service' },
  { path: '/delete-account', title: 'Delete account' },
  { path: '/guides', title: 'Warhammer 40,000 player guides' },
]

test('public product pages deliver their own metadata and canonical URLs without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const details of pages) {
    await page.goto(new URL(details.path, baseURL).href)
    await expect(page).toHaveTitle(`${details.title} — Praetorium`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL(details.canonical ?? details.path, baseURL).href)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', details.title)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      new URL(details.canonical ?? details.path, baseURL).href,
    )
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  }
  await context.close()
})

const guides = [
  {
    slug: 'build-an-army',
    title: 'How to build and check a Warhammer 40,000 army list',
    fact: 'A visitor’s draft stays on this device.',
    action: 'Open the army builder',
    to: '/rosters',
  },
  {
    slug: 'import-a-roster',
    title: 'How to import a Warhammer 40,000 roster',
    fact: 'If the faction cannot be identified, the import stops.',
    action: 'Open Rosters to import',
    to: '/rosters',
  },
  {
    slug: 'compare-loadouts',
    title: 'How to compare Warhammer 40,000 unit loadouts',
    fact: 'the combined result carries shooting’s survivors into melee.',
    action: 'Open the combat simulator',
    to: '/simulator',
  },
  {
    slug: 'track-a-battle',
    title: 'How to track a Warhammer 40,000 battle',
    fact: 'practice games do not.',
    action: 'Open Battles',
    to: '/battles',
  },
]

for (const guide of guides) {
  test(`${guide.slug} is readable and usable without JavaScript on desktop and phone`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      const response = await page.goto(new URL(`/guides/${guide.slug}`, baseURL).href)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle(`${guide.title} — Praetorium`)
      await expect(page.getByRole('heading', { level: 1, name: guide.title })).toBeVisible()
      await expect(page.locator('main')).toContainText(guide.fact)
      await expect(page.getByRole('list', { name: 'Steps', exact: true }).getByRole('listitem')).toHaveCount(4)
      await expect(page.getByRole('heading', { name: /^Worked example:/ })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Example steps' }).getByRole('listitem')).not.toHaveCount(0)
      const image = page.locator('main figure img')
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      await expect(image).toHaveAttribute('alt', /\S/)
      await expect(page.locator('main figure a')).toHaveAttribute('href', `/guides/${guide.slug}.png`)
      await expect(page.getByRole('heading', { name: 'Common questions' })).toBeVisible()
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL(`/guides/${guide.slug}`, baseURL).href)
      expect(
        await page
          .locator('script[type="application/ld+json"]')
          .evaluateAll((elements) => elements.map((element) => JSON.parse(element.textContent))),
      ).toEqual([
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Player guides', item: new URL('/guides', baseURL).href },
            { '@type': 'ListItem', position: 2, name: guide.title, item: new URL(`/guides/${guide.slug}`, baseURL).href },
          ],
        },
      ])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: testInfo.outputPath(`${guide.slug}-${width}.png`), fullPage: true })
      await page.getByRole('link', { name: guide.action, exact: true }).click()
      await expect(page).toHaveURL(new URL(guide.to, baseURL).href)
    }
    await context.close()
  })
}

test('guides can be discovered from the home page, sitemap and agent text', async ({ page, request }, testInfo) => {
  await page.goto('/')
  await page.screenshot({ path: testInfo.outputPath('home-guides-1440.png'), fullPage: true })
  await page.getByRole('link', { name: 'Read the player guides', exact: true }).click()
  await expect(page).toHaveURL('/guides')
  for (const guide of guides) {
    await expect(page.locator('main').getByRole('link').filter({ hasText: guide.title })).toHaveAttribute('href', `/guides/${guide.slug}`)
  }
  await expect(page.locator('footer').getByRole('link', { name: 'Player guides', exact: true })).toHaveAttribute('href', '/guides')
  await page.screenshot({ path: testInfo.outputPath('guides-index-1440.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('guides-index-390.png'), fullPage: true })
  const sitemap = await (await request.get('/sitemap.xml')).text()
  const llms = await (await request.get('/llms.txt')).text()
  for (const guide of guides) {
    expect(sitemap).toContain(`/guides/${guide.slug}</loc>`)
    expect(llms).toContain(`/guides/${guide.slug})`)
  }
  expect(sitemap).not.toMatch(/<loc>[^<]*\/missions<\/loc>/)
  await page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click()
  await page.getByPlaceholder('Search everything…').fill('import')
  await page.getByRole('option').filter({ hasText: 'How to import a Warhammer 40,000 roster' }).click()
  await expect(page).toHaveURL('/guides/import-a-roster')
})

test('unknown guides return a real 404', async ({ request }) => {
  expect((await request.get('/guides/not-a-guide')).status()).toBe(404)
})

for (const path of ['/rules/not-a-document', '/rules/%24documentId', '/rules/%24documentId/', '/rules/not-a-document/not-a-section']) {
  test(`${path} returns a real rules 404`, async ({ page }, testInfo) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Nothing here', exact: true })).toBeVisible()
    if (path === '/rules/%24documentId') await page.screenshot({ path: testInfo.outputPath('invalid-rules.png') })
  })
}

test('rules documents still link to readable sections', async ({ page }) => {
  const response = await page.goto('/rules/core-rules')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'Core Rules', exact: true })).toBeVisible()
  await page.locator('main a[href="/rules/core-rules/moving"]').click()
  await expect(page).toHaveURL('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { level: 1, name: '03. Moving', exact: true })).toBeVisible()
  const section = await page.goto('/rules/core-rules/moving')
  expect(section?.status()).toBe(200)
})
