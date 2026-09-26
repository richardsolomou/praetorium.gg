export function ifNoneMatch(request: Request, etag: string) {
  return (
    request.headers
      .get('if-none-match')
      ?.split(',')
      .some((value) => value.trim() === etag || value.trim() === `W/${etag}` || value.trim() === '*') ?? false
  )
}
