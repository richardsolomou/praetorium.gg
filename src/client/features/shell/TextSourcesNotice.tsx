import { Button } from '@/components/ui/button'
import { openTextSourcesDialog } from '../../components/TextSourcesDialog'
import { chooseTextSources, useTextSourceChoice } from '../../rulesText'
import { useHydrated } from '../../useClientValue'

/**
 * Asks every new device, signed in or not, where its rules text should come from, until it
 * answers. Inline above the page so it never covers what it explains.
 */
export function TextSourcesNotice({ path }: { path: string }) {
  const choice = useTextSourceChoice()
  // The stored answer is unknown until hydration, so a device that answered never sees it flash.
  const hydrated = useHydrated()
  if (!hydrated || choice.decided || path === '/sources') return null
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
