import { useClientValue } from './useClientValue'

const origin = () => window.location.origin

/** Empty on the server and while hydrating, so the server and the first render agree. */
export function useOrigin() {
  return useClientValue(origin, '')
}
