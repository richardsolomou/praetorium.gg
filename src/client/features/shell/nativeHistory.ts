/**
 * Whether going back one history entry stays on the path the player took.
 *
 * The application's tabs share one history stack, so going back from a screen the tab
 * bar opened would land in the tab the player left. The tab bar records the index of
 * each entry it pushes; every other screen goes back to whatever opened it, including
 * the homepage and More, which belong to no tab. The index rather than a flag, because
 * screens stacked on that entry copy its state.
 */
export function historyBackStaysInTab(index: number, state: unknown) {
  return index > 0 && !(state && typeof state === 'object' && 'tabEntry' in state && state.tabEntry === index)
}

/** The state for an entry the tab bar pushes on top of `current`. */
export function openedByTab<State extends { __TSR_index: number }>(current: State) {
  return { ...current, tabEntry: current.__TSR_index + 1 }
}
