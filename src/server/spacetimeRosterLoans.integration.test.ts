import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

async function lendingSetup() {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const owner = randomUUID()
  const borrower = randomUUID()
  const rosterId = randomUUID()
  const now = Date.now()
  await operator.saveRoster({
    id: rosterId,
    userId: owner,
    name: 'Lent roster',
    catalogueId: 'catalogue-proof',
    detachmentId: null,
    disposition: null,
    limit: 1_000,
    picks: '[]',
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    optionalRules: '[]',
    borrowedDetachmentId: null,
    visibility: 'private',
    source: 'editable',
    now,
  })
  const befriend = async () => {
    await operator.requestFriend(owner, borrower, now)
    await operator.acceptFriend(owner, borrower, now + 1)
  }
  const cleanUp = async () => {
    await operator.deleteUserData(owner)
    await operator.deleteUserData(borrower)
  }
  return { operator, owner, borrower, rosterId, now, befriend, cleanUp }
}

it.skipIf(!url || !database || !token)('lends a roster only to an accepted friend, and only from its owner', async () => {
  const { operator, owner, borrower, rosterId, now, befriend, cleanUp } = await lendingSetup()
  try {
    expect(await operator.lendRoster(rosterId, owner, borrower, now)).toBe('not-friends')
    await befriend()
    expect(await operator.lendRoster(rosterId, borrower, owner, now)).toBe('forbidden')
    expect(await operator.lendRoster(rosterId, owner, owner, now)).toBe('not-friends')
    expect(await operator.lendRoster(rosterId, owner, borrower, now)).toBe('lent')
    expect(await operator.usableRoster(rosterId, borrower)).toMatchObject({ roster: { id: rosterId }, lentBy: owner })
    expect(await operator.usableRoster(rosterId, owner)).toMatchObject({ lentBy: null })
    expect(await operator.usableRoster(rosterId, randomUUID())).toBeNull()
    expect((await operator.rostersLentTo(borrower)).map((row) => [row.id, row.ownerId])).toEqual([[rosterId, owner]])
    expect(await operator.rosterLoansByRoster(rosterId, owner)).toEqual([{ borrowerId: borrower, lentAt: now }])
    expect(await operator.rosterLoansByRoster(rosterId, borrower)).toEqual([])
  } finally {
    await cleanUp()
  }
})

it.skipIf(!url || !database || !token)('ends a loan when either player ends it, but not for anyone else', async () => {
  const { operator, owner, borrower, rosterId, now, befriend, cleanUp } = await lendingSetup()
  try {
    await befriend()
    await operator.lendRoster(rosterId, owner, borrower, now)
    expect(await operator.endRosterLoan(rosterId, randomUUID(), borrower)).toBe(false)
    expect(await operator.endRosterLoan(rosterId, borrower, borrower)).toBe(true)
    expect(await operator.usableRoster(rosterId, borrower)).toBeNull()
    await operator.lendRoster(rosterId, owner, borrower, now + 2)
    expect(await operator.endRosterLoan(rosterId, owner, borrower)).toBe(true)
    expect(await operator.rostersLentTo(borrower)).toEqual([])
  } finally {
    await cleanUp()
  }
})

it.skipIf(!url || !database || !token)('ends a loan when the friendship or the roster goes', async () => {
  const { operator, owner, borrower, rosterId, now, befriend, cleanUp } = await lendingSetup()
  try {
    await befriend()
    await operator.lendRoster(rosterId, owner, borrower, now)
    expect(await operator.removeFriend(borrower, owner)).toBe(true)
    expect(await operator.usableRoster(rosterId, borrower)).toBeNull()
    await befriend()
    expect(await operator.usableRoster(rosterId, borrower)).toBeNull()
    await operator.lendRoster(rosterId, owner, borrower, now + 2)
    await operator.deleteRoster(rosterId, owner)
    expect(await operator.rostersLentTo(borrower)).toEqual([])
  } finally {
    await cleanUp()
  }
})
