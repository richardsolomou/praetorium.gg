import { useMatch } from '@tanstack/react-router'

export function useReferenceFaction() {
  const version = useMatch({ from: '/factions/$catalogueId/rules/$rulesVersion', shouldThrow: false })
  const current = useMatch({ from: '/factions/$catalogueId', shouldThrow: false })
  return version?.loaderData?.faction ?? current?.loaderData?.faction
}
