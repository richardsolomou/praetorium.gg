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

function render(count: number) {
  const client = new QueryClient()
  client.setQueryData(meKey(), { id: 'player', name: 'Alex' })
  client.setQueryData(recentMatchupsKey(), recent(count))
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RecentSimulations)))
}

it('shows every simulation', () => {
  expect(render(5).match(/aria-label="Unit \d vs/g)).toHaveLength(5)
})
