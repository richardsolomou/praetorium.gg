import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('stores battle sharing and derives onboarding from product facts', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const friendId = randomUUID()
  const now = Date.now()
  try {
    expect(await operator.battleAudience(userId)).toBe('public')
    expect(await operator.setBattleAudience(userId, 'friends', now)).toBe('friends')
    expect(await operator.battleAudience(userId)).toBe('friends')
    expect(await operator.onboardingProgress(userId)).toEqual({ completedTasks: [], skippedTasks: [], welcomed: false })
    expect((await operator.updateOnboardingProgress(userId, { operation: 'welcome' })).welcomed).toBe(true)
    expect((await operator.updateOnboardingProgress(userId, { operation: 'skip', task: 'league' })).skippedTasks).toEqual(['league'])
    expect((await operator.updateOnboardingProgress(userId, { operation: 'restore', task: 'league' })).skippedTasks).toEqual([])
    expect((await operator.updateOnboardingProgress(userId, { operation: 'complete', task: 'reference' })).completedTasks).toEqual([
      'reference',
    ])
    await operator.requestFriend(userId, friendId, now)
    await operator.acceptFriend(userId, friendId, now + 1)
    expect((await operator.onboardingProgress(userId)).completedTasks).toEqual(['friend', 'reference'])
  } finally {
    await operator.deleteUserData(userId)
    await operator.deleteUserData(friendId)
  }
})
