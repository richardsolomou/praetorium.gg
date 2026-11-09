import { createFileRoute, redirect } from '@tanstack/react-router'
import { searchText } from '../client/searchParams'

type ImportLinkSearch = { d?: string; src?: string; listname?: string }

/** Where other sites' "Open in" links land, taking the parameters they send every builder; the list moves to the fragment for the import dialog. */
export const Route = createFileRoute('/import')({
  validateSearch: (search: Record<string, unknown>): ImportLinkSearch => {
    const [d, src, listname] = [searchText(search.d), searchText(search.src), searchText(search.listname)]
    return { ...(d ? { d } : {}), ...(src ? { src } : {}), ...(listname ? { listname } : {}) }
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/rosters', ...(search.d ? { hash: new URLSearchParams(search).toString() } : {}), replace: true })
  },
})
