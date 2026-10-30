import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

/** A cookie's value from the request on the server, or from the page in the browser. */
export const requestCookie = createIsomorphicFn()
  .server((name: string) => getCookie(name))
  .client((name: string) =>
    document.cookie
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.slice(name.length + 1),
  )
