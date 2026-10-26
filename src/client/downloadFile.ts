export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** A player-chosen name as a file name every system accepts, or the fallback when nothing of it survives. */
export const safeFileName = (name: string, fallback: string) => name.replaceAll(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 100) || fallback
