import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ComponentPropsWithRef } from 'react'
import { catalogueEditionId, editionFamilyId } from '../../core/catalogueEdition'
import { factionReferenceRoute } from '../../core/factionReferenceRoute'
import { factionFor } from '../factions'
import type { factionIndex } from '../functions'
import { cachedFaction, factionIndexQuery } from '../queries'

type Props = Omit<ComponentPropsWithRef<'a'>, 'href'> & {
  hash?: string
} & (
    | { to: '/factions/$catalogueId' | '/factions/$catalogueId/datasheets'; params: { catalogueId: string } }
    | { to: '/factions/$catalogueId/datasheets/$entryId'; params: { catalogueId: string; entryId: string } }
    | { to: '/factions/$catalogueId/detachments/$detachmentId'; params: { catalogueId: string; detachmentId: string } }
  )

export function FactionReferenceLink({ to, params, ...props }: Props) {
  // A faction the page already read names its own route, so a link to it never downloads every faction's summary.
  const loaded = cachedFaction(useQueryClient(), params.catalogueId)
  const { data } = useQuery({ ...factionIndexQuery(), enabled: !loaded })
  const route = loaded ? factionReferenceRoute(loaded) : indexRoute(data, params.catalogueId)
  const catalogueId = route?.catalogueId ?? params.catalogueId
  const rulesVersion = route?.rulesVersion
  if (rulesVersion) {
    if (to === '/factions/$catalogueId/datasheets/$entryId')
      return (
        <Link
          {...props}
          to="/factions/$catalogueId/rules/$rulesVersion/datasheets/$entryId"
          params={{ catalogueId, rulesVersion, entryId: params.entryId }}
        />
      )
    if (to === '/factions/$catalogueId/detachments/$detachmentId')
      return (
        <Link
          {...props}
          to="/factions/$catalogueId/rules/$rulesVersion/detachments/$detachmentId"
          params={{ catalogueId, rulesVersion, detachmentId: params.detachmentId }}
        />
      )
    if (to === '/factions/$catalogueId/datasheets')
      return <Link {...props} to="/factions/$catalogueId/rules/$rulesVersion/datasheets" params={{ catalogueId, rulesVersion }} />
    return <Link {...props} to="/factions/$catalogueId/rules/$rulesVersion" params={{ catalogueId, rulesVersion }} />
  }
  const search = {}
  if (to === '/factions/$catalogueId/datasheets/$entryId')
    return <Link {...props} to={to} params={{ catalogueId, entryId: params.entryId }} search={search} />
  if (to === '/factions/$catalogueId/detachments/$detachmentId')
    return <Link {...props} to={to} params={{ catalogueId, detachmentId: params.detachmentId }} search={search} />
  return <Link {...props} to={to} params={{ catalogueId }} search={search} />
}

function indexRoute(data: Awaited<ReturnType<typeof factionIndex>> | undefined, catalogueId: string) {
  const faction =
    factionFor(data, catalogueId) ??
    data?.factions.find((entry) => entry.isDefault && editionFamilyId(entry.id) === editionFamilyId(catalogueId)) ??
    data?.factions.find((entry) => editionFamilyId(entry.id) === editionFamilyId(catalogueId))
  const editionId = catalogueEditionId(catalogueId)
  return faction
    ? factionReferenceRoute({
        ...faction,
        edition: editionId
          ? (data?.factions.find((entry) => entry.edition?.id === editionId)?.edition ?? { id: editionId })
          : faction.edition,
      })
    : null
}
