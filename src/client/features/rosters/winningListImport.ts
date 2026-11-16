import type { useNavigate } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { encodeImportLinkText } from '../../../core/rosterExchange'
import type { WinningSearch } from './rosterSearch'

/** Opens a winning list in the Winning tab's import review, through the same address another site's import link uses. */
export async function openWinningImport(
  navigate: ReturnType<typeof useNavigate>,
  list: { id: string; name: string; placing: number; event: { source: string } },
  text: string,
  search: WinningSearch = {},
) {
  const encoded = await encodeImportLinkText(text)
  posthog.capture('winning_list_import_opened', { placing: list.placing })
  await navigate({
    to: '/rosters',
    search: { view: 'tournament-lists', ...search },
    hash: new URLSearchParams({ d: encoded, src: list.event.source, listname: list.name }).toString(),
    resetScroll: false,
  })
}
