import { Faker, en } from '@faker-js/faker'

/**
 * Seeded, so every preview seed, browser test and docs screenshot meets the same people and scores; drawing from it in a
 * different order changes everything drawn after.
 */
export const previewFaker = new Faker({ locale: [en], seed: 40_000 })

const taken = new Set(['Kieran Vale', 'Sam Okafor'])

function person() {
  for (;;) {
    const name = `${previewFaker.person.firstName()} ${previewFaker.person.lastName()}`
    if (!taken.has(name)) {
      taken.add(name)
      return name
    }
  }
}

export const PREVIEW_PLAYER_NAME = person()
export const PREVIEW_OPPONENT_NAME = person()
export const PREVIEW_ALLY_NAME = person()
export const PREVIEW_RIVAL_NAME = person()

/** Players with no tie to the preview login, who give the public battles and the leaderboard some volume. */
export const PREVIEW_CROWD = Array.from({ length: 12 }, (_, index) => ({
  email: `player-${index + 1}@praetorium.gg`,
  password: `player-${index + 1}-player-${index + 1}`,
  name: person(),
}))
