import { createFileRoute, redirect } from '@tanstack/react-router'
import { catalogueUpdateAddress } from '../client/functions'

/** An update's own page, folded into the index: its link opens the index page that lists it, at its row. */
export const Route = createFileRoute('/changes/$update')({
  beforeLoad: async ({ params }) => {
    const address = /^[0-9a-f]{16}$/.test(params.update) ? await catalogueUpdateAddress({ data: { id: params.update } }) : null
    throw redirect({
      to: '/data-updates',
      ...(address ? { search: address.before ? { before: address.before } : {}, hash: address.anchor } : {}),
      replace: true,
    })
  },
})
