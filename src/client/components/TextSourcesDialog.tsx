import { Link } from '@tanstack/react-router'
import { useId, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toggled } from '../../core/collections'
import { TEXT_SOURCES, type TextSource } from '../../shared/sourceText'
import { TEXT_SOURCE_INFO, chooseTextSources, useTextSourceChoice } from '../rulesText'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './Dialog'

const linkClass = 'text-info hover:text-parchment'

/** One external source, what it provides, and a switch for it; the caller decides what the switch writes. */
export function TextSourceRow({
  source,
  checked,
  disabled,
  onCheckedChange,
}: {
  source: TextSource
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = useId()
  const { name, repository, provides, licence } = TEXT_SOURCE_INFO[source]
  return (
    <div className="flex items-start justify-between gap-4 border border-edge bg-sunken p-3 font-sans">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold text-bone">
          {name}
        </label>
        <p className="text-xs text-dim">{provides}</p>
        <p className="text-xs text-faint">
          <a href={repository} className={linkClass} target="_blank" rel="noreferrer">
            {repository.replace('https://github.com/', '')}
          </a>{' '}
          · {licence}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-2 text-xs text-dim">
        <span className="hidden sm:inline">Load on this device</span>
        <Switch id={id} data-text-source-switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </span>
    </div>
  )
}

/** Whether the one dialog every prompt opens is showing. */
let shown = false
const listeners = new Set<() => void>()
const set = (next: boolean) => {
  shown = next
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Asks the reader which external sources to load; the same question wherever it is asked. */
export const openTextSourcesDialog = () => set(true)

/**
 * The only place a prompt sends a reader to load rules text: it says where the text comes
 * from and records only the sources they turn on, so nothing loads by a single click.
 */
export function TextSourcesDialog() {
  const open = useSyncExternalStore(
    subscribe,
    () => shown,
    () => false,
  )
  return (
    <Dialog open={open} onOpenChange={set}>
      {open ? <TextSourcesForm close={() => set(false)} /> : null}
    </Dialog>
  )
}

function TextSourcesForm({ close }: { close: () => void }) {
  const choice = useTextSourceChoice()
  const [selected, setSelected] = useState<ReadonlySet<TextSource>>(choice.sources)
  const changed = TEXT_SOURCES.some((source) => selected.has(source) !== choice.sources.has(source))
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Load rules text from community sources</DialogTitle>
        <DialogDescription>
          Rules text is copyrighted material, so Praetorium doesn’t host or serve it. A source you turn on here is fetched by this browser
          directly from that community project on GitHub.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-dim">Turn on the sources to load:</p>
          <Button
            variant="ghost"
            size="xs"
            disabled={selected.size === TEXT_SOURCES.length}
            onClick={() => setSelected(new Set(TEXT_SOURCES))}
          >
            Select all
          </Button>
        </div>
        <div className="space-y-2">
          {TEXT_SOURCES.map((source) => (
            <TextSourceRow
              key={source}
              source={source}
              checked={selected.has(source)}
              onCheckedChange={(on) => setSelected((current) => toggled(current, source, on))}
            />
          ))}
        </div>
        <p className="text-xs text-dim">
          Your choice stays on this device. Change it any time on{' '}
          <Link to="/sources" className={linkClass} onClick={close}>
            Data sources
          </Link>
          .
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button
          disabled={!changed || selected.size === 0}
          onClick={() => {
            chooseTextSources(selected)
            close()
          }}
        >
          Load selected
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
