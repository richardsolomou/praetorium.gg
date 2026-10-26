import { expect, test } from './test'
import { signUp, uniqueName, uploadAvatar } from './account'
import { baseURL } from './stackEnv'
import { withAuthSql } from './storage'

test('a local profile upload is readable through the Node object route', async ({ page, request }) => {
  const name = uniqueName('R2 avatar')
  await signUp(page, name)
  await uploadAvatar(page)
  const player = await withAuthSql(
    (database) => database.prepare('SELECT image FROM user WHERE name = ? LIMIT 1').get(name) as { image: string | null } | undefined,
  )
  if (!player?.image) throw new Error('Uploaded profile image is missing')
  expect(player?.image).toMatch(new RegExp(`^${baseURL}/avatars/[0-9a-f]{64}\\.jpg$`))
  const response = await request.get(player.image)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/jpeg')
})
