import { expect, it } from 'vitest'
import { DEFAULT_ROSTER_ROWS, keptRosterRows } from './rosterCookie'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../../core/rosterLibrary'

it.each([
  [undefined, DEFAULT_ROSTER_ROWS],
  ['3', 3],
  ['0', 1],
  ['500', ROSTER_LIBRARY_BATCH_SIZE],
  ['2.5', DEFAULT_ROSTER_ROWS],
  ['rows', DEFAULT_ROSTER_ROWS],
])('reserves %s remembered rows as %i', (value, rows) => expect(keptRosterRows(value)).toBe(rows))
