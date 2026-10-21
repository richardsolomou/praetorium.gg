import { Button } from '@/components/ui/button'
import { openTextSourcesDialog } from '../../components/TextSourcesDialog'
import { chooseTextSources, useTextSourceChoice } from '../../rulesText'

const RULES_TEXT_PATHS = [
  '/factions/',
  '/rules/',
  '/missions',
  '/mission-packs/',
  '/mission-matchups/',
  '/rosters',
  '/battles/',
  '/simulator',
]

/** Whether a page draws rules text, so asking where it comes from belongs there. */
export function showsRulesText(path: string) {
  return RULES_TEXT_PATHS.some((prefix) => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))
}

/**
 * Asks every new device, signed in or not, where its rules text should come from, until it
 * answers, on the pages that draw rules text. Inline above the page so it never covers what it explains.
 */
export function TextSourcesNotice({ path }: { path: string }) {
  const choice = useTextSourceChoice()
  // Drawn by the server too, so it never pushes the page down late; a device that answered hides it from the first frame (styles.css).
  if (choice.decided || !showsRulesText(path)) return null
  return (
    <aside
      aria-label="Rules text"
      data-text-sources-notice
      data-print-hide
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge bg-panel px-4 py-2 text-xs"
    >
      <p className="min-w-0 flex-1 basis-64 text-dim">
        Praetorium shows names, numbers and points. Rules text loads in your browser from community sources you choose.
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => openTextSourcesDialog()}>
          Choose sources
        </Button>
        <Button size="sm" variant="ghost" onClick={() => chooseTextSources([])}>
          Not now
        </Button>
      </div>
    </aside>
  )
}
