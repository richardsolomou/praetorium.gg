import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

const cookieValue = (cookies: string | null, name: string) =>
  (cookies ?? '')
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1)

/** A cookie's value from the request on the server, or from the page in the browser. */
export const requestCookie = createIsomorphicFn()
  .server((name: string) => cookieValue(getRequest().headers.get('cookie'), name))
  .client((name: string) => cookieValue(document.cookie, name))
