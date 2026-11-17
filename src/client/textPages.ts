/** Counts the pages the reader has opened, so a rules text file that failed on an earlier page is asked for again. */
let page = 0

export const textPage = () => page

/** Called as the reader opens another page: files that failed before load again when that page needs them. */
export function openedTextPage() {
  page += 1
}
