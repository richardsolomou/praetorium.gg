import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { datasheetMatchup } from '../../../contracts/simulatorState'
import { meKey, recentMatchupsKey } from '../../queries/queryKeys'
import { RecentSimulations } from './RecentSimulations'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, 'aria-label': label }: PropsWithChildren<{ 'aria-label'?: string }>) =>
    createElement('a', { 'aria-label': label }, children),
}))

const recent = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    shared: datasheetMatchup('necrons', `unit-${index}`, 'attacker'),
    attacker: `Unit ${index}`,
    defender: 'Intercessor Squad',
  }))

function render(count: number, limit?: number) {
  const client = new QueryClient()
  client.setQueryData(meKey(), { id: 'player', name: 'Alex' })
  client.setQueryData(recentMatchupsKey(), recent(count))
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RecentSimulations, { surface: 'home', limit })))
}

it('shows only the newest simulations up to its limit', () => {
  expect(render(5, 3).match(/aria-label="Unit \d vs/g)).toEqual(['aria-label="Unit 0 vs', 'aria-label="Unit 1 vs', 'aria-label="Unit 2 vs'])
})

it('links to the rest of the simulations when it leaves some out', () => {
  expect(render(4, 3)).toContain('All simulations')
})

it('offers no link when every simulation fits', () => {
  expect(render(3, 3)).not.toContain('All simulations')
})

it('shows every simulation without a limit', () => {
  expect(render(5).match(/aria-label="Unit \d vs/g)).toHaveLength(5)
})
