/** Minutes and seconds, with hours once a stretch passes one. */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  const [hours, minutes] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60)]
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`
}
