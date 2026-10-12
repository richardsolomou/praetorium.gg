let active = false

/** Whether realtime signals, or their fallback refresh, are keeping product queries current on this page. */
export const liveProductRefresh = () => active

export function setLiveProductRefresh(next: boolean) {
  active = next
}
