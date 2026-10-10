import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ComponentPropsWithRef } from 'react'
import { catalogueEditionId, editionFamilyId } from '../../core/catalogueEdition'
import { factionReferenceRoute } from '../../core/factionReferenceRoute'
import { factionIndexQuery } from '../queries'

type Props = Omit<ComponentPropsWithRef<'a'>, 'href'> & {
  hash?: string
} & (
    | { to: '/factions/$catalogueId' | '/factions/$catalogueId/datasheets'; params: { catalogueId: string } }
    | { to: '/factions/$catalogueId/datasheets/$entryId'; params: { catalogueId: string; entryId: string } }
    | { to: '/factions/$catalogueId/detachments/$detachmentId'; params: { catalogueId: string; detachmentId: string } }
  )

export function FactionReferenceLink({ to, params, ...props }: Props) {
  const { data } = useQuery(factionIndexQuery())
  const faction =
    data?.factions.find((entry) => entry.id === params.catalogueId || entry.slug === params.catalogueId) ??
    data?.factions.find((entry) => entry.id === editionFamilyId(params.catalogueId))
  const editionId = catalogueEditionId(params.catalogueId)
  const route = faction
    ? factionReferenceRoute({
        ...faction,
        edition: editionId ? { id: editionId } : faction.edition,
      })
    : null
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
