import type { ProductGuide } from '../../../contracts/productGuides'

const overviews: Record<ProductGuide['slug'], { title: string; points: readonly string[] }> = {
  'prepare-your-first-game': {
    title: 'Ready before the first roll',
    points: ['Agree the pack, size and time.', 'Explain terrain and surprise rules.', 'Give each unit a first-turn job.'],
  },
  'build-a-balanced-army': {
    title: 'Build around jobs',
    points: ['Hold somewhere safe.', 'Contest and reach the board.', 'Keep an answer to tough targets.'],
  },
  'plan-your-scoring': {
    title: 'A score is a decision',
    points: ['What does the card require?', 'Which unit can do it?', 'What do you give up to score?'],
  },
  'build-an-army': {
    title: 'From models to a list',
    points: ['Choose your faction and size.', 'Add units and their equipment.', 'Resolve warnings before saving.'],
  },
  'import-a-roster': {
    title: 'Keep the original beside you',
    points: ['Paste the complete text export.', 'Review missing units and choices.', 'Compare the result before saving.'],
  },
  'compare-loadouts': {
    title: 'Compare the outcome you need',
    points: ['Use a target you expect to face.', 'Change one loadout or effect.', 'Read the odds, not just the average.'],
  },
  'track-a-battle': {
    title: 'One shared record',
    points: ['Seat the players and choose armies.', 'Agree the table and missions.', 'Confirm scores at their timing.'],
  },
}

const illustrations = {
  'prepare-your-first-game': {
    image: '/guides/game-kit.svg',
    alt: 'Illustrated tabletop kit: a squad of miniatures, list and rules, dice and measuring tools.',
    caption: 'Pack the tools, then agree the game together.',
  },
  'build-a-balanced-army': {
    image: '/guides/army-roles.svg',
    alt: 'An illustrative battlefield shows squads holding home, contesting the middle and reaching a flank, with a vehicle providing a threat.',
    caption: 'Illustrative positions, not a terrain layout or a deployment rule.',
  },
  'plan-your-scoring': {
    image: '/guides/scoring-choice.svg',
    alt: 'A utility squad moves towards a scoring opportunity while the main damage unit remains protected for later.',
    caption: 'A decision example; the current card decides eligibility and scoring.',
  },
} as const

export function guideVisual(guide: ProductGuide) {
  const overview = overviews[guide.slug]
  if (guide.slug === 'prepare-your-first-game' || guide.slug === 'build-a-balanced-army' || guide.slug === 'plan-your-scoring') {
    return { ...overview, ...illustrations[guide.slug], width: 560, height: 340, screenshot: false }
  }
  return {
    ...overview,
    image: guide.example.image,
    alt: guide.example.imageAlt,
    caption: guide.example.caption,
    width: guide.example.imageWidth,
    height: guide.example.imageHeight,
    screenshot: true,
  }
}
