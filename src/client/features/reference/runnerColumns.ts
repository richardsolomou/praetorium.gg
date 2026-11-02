/**
 * A runner whose parts flow down newspaper columns. Each later column's rail is the column rule:
 * a 34px gap centres the 2px rule where the 1.5rem gate leaves it, as the first column's rail does.
 */
export const RUNNER_COLUMNS =
  'runner block! gap-x-[34px] [column-rule:2px_solid_var(--color-runner)] *:mb-2 *:break-inside-avoid *:last:mb-0'
