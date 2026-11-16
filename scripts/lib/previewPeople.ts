import { Faker, en } from '@faker-js/faker'

/**
 * Seeded, so every preview seed, browser test and docs screenshot meets the same people and scores; drawing from it in a
 * different order changes everything drawn after.
 */
export const previewFaker = new Faker({ locale: [en], seed: 40_000 })

// Curated rather than faker's general word lists, which can pair into handles nobody would pick.
const HANDLE_WORDS = ['Grim', 'Iron', 'Void', 'Crimson', 'Silent', 'Ashen', 'Gilded', 'Rusty', 'Salty', 'Lucky', 'Dice', 'Paint']
const HANDLE_NOUNS = ['Warden', 'Hammer', 'Talon', 'Ork', 'Marine', 'Brush', 'Sprue', 'Tank', 'Herald', 'Gaunt', 'Shrine', 'Pilot']
const taken = new Set(['Kieran Vale', 'Sam Okafor'])

/** Most players go by a handle: a two-word tag, or a first name with a number. */
function person() {
  for (;;) {
    const name = previewFaker.datatype.boolean({ probability: 0.6 })
      ? `${previewFaker.helpers.arrayElement(HANDLE_WORDS)}${previewFaker.helpers.arrayElement(HANDLE_NOUNS)}`
      : `${previewFaker.person.firstName().toLowerCase()}${previewFaker.number.int({ min: 2, max: 99 })}`
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

/** The crowd's own public group and Swiss tournament, named like ones players run. */
const groupCity = previewFaker.location.city()
export const PREVIEW_CROWD_GROUP = {
  name: `${groupCity} Wargamers`,
  description: `Weeknight games in ${groupCity}. Bring a 2,000-point list.`,
}
export const PREVIEW_CROWD_TOURNAMENT = {
  name: `${previewFaker.location.city()} Open`,
  description: 'Three Swiss rounds at 2,000 points, paired once every table has finished.',
}
