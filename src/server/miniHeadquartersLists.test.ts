import { expect, it } from 'vitest'
import { eventLists, eventResults } from './miniHeadquartersLists'

const result = (ranking: number, player: string, games: string[]) => `
  <article class="rounded-3xl border">
    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-2xl font-bold text-orange-400">
      ${ranking}
    </div>
    <h2 class="text-2xl font-bold tracking-tight text-white">
      ${player}
    </h2>
    <p class="mt-3 text-base leading-7 text-slate-200">
      ${games.map((game) => `<span class="font-semibold text-green-400">${game}</span>`).join('<span class="mx-1 text-slate-500">/</span>')}
    </p>
  </article>`

it("reads each player's ranking and record from an event's results", () => {
  const html = `<title>GT n78 | MiniHeadQuarters</title>
    <a href="/tournaments/individual/results/gt-2026-07-12/round/1">Round 1</a>
    <a href="/tournaments/individual/results/gt-2026-07-12/round/2">Round 2</a>
    <a href="/tournaments/individual/results/gt-2026-07-12/round/3">Round 3</a>
    ${result(1, 'Elways', ['W', 'W', 'W'])}${result(2, 'Pat &amp; Co', ['W', 'D', 'L'])}`

  expect(eventResults(html, 'gt-2026-07-12')).toEqual({
    name: 'GT n78',
    rounds: 3,
    players: [
      { ranking: 1, player: 'Elways', record: 'W3 L0 D0' },
      { ranking: 2, player: 'Pat & Co', record: 'W1 L1 D1' },
    ],
  })
})

it('reads each army list as text under its player and faction label', () => {
  const html = `<article class="overflow-hidden">
      <span class="text-base font-semibold text-white sm:text-lg">
        Ayor - Imperium - Adeptus Custodes
      </span>
      <div class="whitespace-pre-line text-sm leading-7 text-slate-300">
        Shield Host (1 000 Points)<br><br>Allarus Custodians&#x27; axes
      </div>
    </article>`

  expect(eventLists(html)).toEqual([
    { label: 'Ayor - Imperium - Adeptus Custodes', text: "Shield Host (1 000 Points)\n\nAllarus Custodians' axes" },
  ])
})
