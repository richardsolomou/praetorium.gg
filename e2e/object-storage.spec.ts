import { expect, test } from '@playwright/test'
import { signUp, uniqueName } from './account'
import { baseURL } from './stackEnv'
import { withAuthSql } from './storage'

test('a local profile upload is readable through the same Worker and R2 binding', async ({ page, request }) => {
  const name = uniqueName('R2 avatar')
  await signUp(page, name)
  await page.goto('/profile')
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
  const player = await withAuthSql(
    (database) => database.prepare('SELECT image FROM user WHERE name = ? LIMIT 1').get(name) as { image: string | null } | undefined,
  )
  if (!player?.image) throw new Error('Uploaded profile image is missing')
  expect(player?.image).toMatch(new RegExp(`^${baseURL}/praetorium/avatars/[0-9a-f]{64}\\.webp$`))
  const response = await request.get(player.image)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/webp')
})
