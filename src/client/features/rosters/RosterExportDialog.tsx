import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Download, ExternalLink, LoaderCircle } from 'lucide-react'
import { posthog } from 'posthog-js'
import { type ReactNode, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { buttonClass } from '../../components/buttonClass'
import { Choice } from '../../components/Choice'
import { nativeBridgeVersion } from '../../nativeBridge'
import { exportRoster } from '../../functions'
import { Problem } from '../../components/Problem'
import { useRuleSummaries } from '../../ruleSummaries'
import { abilityKeysNamed, summaryPlainText } from '../../../shared/ruleSummaries'
import { datasheetAbilitySummary, unitsInBook } from '../../../shared/vsDataAbilities'
import { catalogueEditionId } from '../../../core/catalogueEdition'
import { ruleAbilitySummariesQuery, ruleUnitsQuery } from '../../queries/references'
import { useCopyText } from '../../useCopyText'
import { downloadFile, safeFileName } from '../../downloadFile'

type ExportInput = Parameters<typeof exportRoster>[0]['data']
type Exported = Awaited<ReturnType<typeof exportRoster>>
/** The readable export a dialog opens with, and the input it was made from, so the dialog can ask for the file too. */
export type RosterTextExport = Exported & { input: ExportInput }
type RosterExportFormat = NonNullable<ExportInput['format']>

const YELLOWSCRIBE = 'https://yellowscribe.link'
const YELLOWSCRIBE_MOD = 'https://steamcommunity.com/sharedfiles/filedetails/?id=2920625970'

/** A roster as readable text, or as the file Yellowscribe turns into a Tabletop Simulator army. */
export function RosterExportDialog({ exported, onClose }: { exported: RosterTextExport | null; onClose: () => void }) {
  return (
    <Dialog open={exported !== null} onOpenChange={(open) => (open ? null : onClose())}>
      {/* Held at the top rather than centred, so switching format leaves the choice where it was. */}
      <DialogContent size="md" className="sm:top-8 sm:translate-y-0">
        <DialogHeader>
          <DialogTitle className="text-2xl">Export roster</DialogTitle>
          <DialogDescription>Take your roster to another app, a tournament organiser or Tabletop Simulator.</DialogDescription>
        </DialogHeader>
        {exported ? <ExportBody exported={exported} /> : null}
      </DialogContent>
    </Dialog>
  )
}

/** Mounted for one opening, so the format resets and the file is asked for at most once while the dialog is open. */
function ExportBody({ exported }: { exported: RosterTextExport }) {
  const [format, setFormat] = useState<RosterExportFormat>('readable')
  const [wantsFile, setWantsFile] = useState(false)
  const file = useQuery({
    queryKey: ['roster-export-file', exported.input],
    queryFn: () => exportRoster({ data: { ...exported.input, format: 'ros' } }),
    enabled: wantsFile,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })
  const omitted = exported.omittedUnitCount + exported.omittedSelectionCount
  // Tabletop Simulator runs on a computer, and the app has nowhere to save the file a computer would read.
  const formatChoice =
    nativeBridgeVersion() === undefined ? (
      <Choice
        label="Export as"
        value={format}
        options={[
          { value: 'readable', name: 'Text', detail: 'For other apps and organisers' },
          { value: 'ros', name: 'Tabletop Simulator', detail: 'A roster file for Yellowscribe' },
        ]}
        onChange={(next) => {
          if (next === 'ros') setWantsFile(true)
          setFormat(next)
        }}
      />
    ) : null
  return format === 'ros' ? (
    <TabletopExport
      name={exported.name}
      file={file.data ?? null}
      failed={file.isError}
      onRetry={() => void file.refetch()}
      omitted={omitted}
      formatChoice={formatChoice}
    />
  ) : (
    <TextExport exported={exported} omitted={omitted} formatChoice={formatChoice} />
  )
}

function Omitted({ count }: { count: number }) {
  return count ? (
    <Problem>
      {count} unresolved {count === 1 ? 'unit, detachment or option is' : 'units, detachments or options are'} left out. Resolve them in the
      builder before submitting this roster.
    </Problem>
  ) : null
}

function TextExport({ exported, omitted, formatChoice }: { exported: Exported; omitted: number; formatChoice: ReactNode }) {
  const { copy: copyText, copied, problem } = useCopyText()
  const copy = async () => {
    if (await copyText(exported.text, { failure: 'Copy failed. Select the text to copy it.', operation: 'roster_export_copy' }))
      posthog.capture('roster_export_copied', { format: 'readable' })
  }
  const download = () => {
    downloadFile(`${safeFileName(exported.name, 'roster')}-readable.txt`, exported.text, 'text/plain;charset=utf-8')
    posthog.capture('roster_export_downloaded', { format: 'readable' })
  }
  return (
    <>
      <DialogBody className="grid gap-3">
        {formatChoice}
        <Omitted count={omitted} />
        <h3 id="roster-export-text" className="eyebrow">
          Roster text
        </h3>
        <pre
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll a long list where it scrolls on its own.
          tabIndex={0}
          aria-labelledby="roster-export-text"
          className="rounded-lg border border-edge bg-sunken px-4 py-3 font-mono text-2xs leading-relaxed wrap-anywhere whitespace-pre-wrap text-bone/90 select-text sm:max-h-[min(28rem,55dvh)] sm:overflow-y-auto"
        >
          {exported.text}
        </pre>
        {problem ? <Problem>{problem}</Problem> : null}
        <p className="text-xs text-dim">
          Includes custom unit names, model counts, equipment, enhancements, Warlord, attachments, setup and rules version. Unit notes,
          preparation, rule waivers and optional rules are left out.
        </p>
      </DialogBody>
      <DialogFooter>
        {nativeBridgeVersion() === undefined ? (
          <Button variant="outline" onClick={download}>
            <Download />
            Download text
          </Button>
        ) : null}
        <Button onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy text'}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Each ability the file describes, an Abilities profile's or a rule's, with the unit it belongs to. */
function describedAbilities(file: Document) {
  return [...file.querySelectorAll('force > selections > selection')].flatMap((unit) =>
    [
      ...unit.querySelectorAll('profile[typeName="Abilities"] > characteristics > characteristic[name="Description"], rule > description'),
    ].map((description) => {
      const ability = description.closest('profile, rule')!
      return {
        description,
        owner: unit.getAttribute('entryId') ?? '',
        name: ability.getAttribute('name') ?? '',
        id: ability.getAttribute('id') ?? undefined,
        text: description.textContent ?? '',
      }
    }),
  )
}

/**
 * The file arrives with each ability's text as tokens, swapped here for its VS Data summary, so it never carries a
 * source's own wording.
 */
function TabletopExport({
  name,
  file,
  failed,
  onRetry,
  omitted,
  formatChoice,
}: {
  name: string
  file: Exported | null
  failed: boolean
  onRetry: () => void
  omitted: number
  formatChoice: ReactNode
}) {
  const parsed = useMemo(() => (file ? new DOMParser().parseFromString(file.text, 'application/xml') : null), [file])
  const abilities = useMemo(() => (parsed ? describedAbilities(parsed) : []), [parsed])
  const catalogueId = parsed?.querySelector('force')?.getAttribute('catalogueId') ?? ''
  const printed = useRuleSummaries(abilities.map((ability) => ability.text))
  const units = useQuery({ ...ruleUnitsQuery(catalogueEditionId(catalogueId)), enabled: Boolean(catalogueId) })
  const bookUnits = useMemo(() => (units.data ? unitsInBook(units.data, catalogueId) : null), [units.data, catalogueId])
  const core = useQuery(ruleAbilitySummariesQuery())
  const ready = Boolean(parsed) && !printed.pending && !(catalogueId && units.isPending) && !core.isPending
  // As a datasheet shows them: the unit's own record or the one its printed text names, else the core ability so named.
  const summaryOf = ({ owner, name: ability, id, text }: (typeof abilities)[number]) =>
    datasheetAbilitySummary(bookUnits, owner, id, printed.recordsOf(text)) ??
    abilityKeysNamed(ability)
      .map((key) => core.data?.[key])
      .find(Boolean) ??
    null
  const download = () => {
    if (!parsed) return
    const described = parsed.cloneNode(true) as Document
    let summarised = 0
    for (const ability of describedAbilities(described)) {
      const summary = summaryOf(ability)
      if (summary) summarised++
      ability.description.textContent = summary ? summaryPlainText(summary) : '—'
    }
    downloadFile(`${safeFileName(name, 'roster')}.ros`, new XMLSerializer().serializeToString(described), 'application/xml;charset=utf-8')
    posthog.capture('roster_export_downloaded', { format: 'ros', summarised, described: abilities.length })
  }
  return (
    <>
      <DialogBody className="grid gap-3 text-sm">
        {formatChoice}
        <Omitted count={omitted} />
        <h3 id="roster-export-steps" className="eyebrow">
          Load it in Tabletop Simulator
        </h3>
        <ol aria-labelledby="roster-export-steps">
          <Step number={1} title="Download the roster file">
            <span className="font-mono text-xs">{`${safeFileName(name, 'roster')}.ros`}</span>
          </Step>
          <Step number={2} title="Upload it to Yellowscribe">
            At{' '}
            <a href={YELLOWSCRIBE} target="_blank" rel="noreferrer" className="text-info underline">
              yellowscribe.link
            </a>
            , choose a Tabletop Simulator model for each of yours, then copy the code it gives you.
          </Step>
          <Step number={3} title="Paste the code in Tabletop Simulator" last>
            Into the{' '}
            <a href={YELLOWSCRIBE_MOD} target="_blank" rel="noreferrer" className="text-info underline">
              Yellowscribe v2 mod
            </a>
            , which builds the army with each model's stats and abilities.
          </Step>
        </ol>
        {failed ? (
          <div className="flex flex-wrap items-center gap-3">
            <Problem className="min-w-0 flex-1">The roster file could not be prepared.</Problem>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-dim">
          Includes each unit's models, wargear, statlines, weapons and keywords, and each ability with its VS Data summary where there is
          one. Unit notes and preparation are left out.
        </p>
      </DialogBody>
      <DialogFooter>
        <a href={YELLOWSCRIBE} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'outline' })}>
          <ExternalLink />
          Open Yellowscribe
        </a>
        <Button disabled={!ready} onClick={download}>
          {ready ? <Download /> : <LoaderCircle className="animate-spin" />}
          {ready ? 'Download roster file' : 'Preparing file…'}
        </Button>
      </DialogFooter>
    </>
  )
}

/** One numbered assembly step, hung from the runner that joins it to the next. */
function Step({ number, title, last = false, children }: { number: number; title: string; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
      {last ? null : <span aria-hidden className="absolute top-9 bottom-1 left-[1.125rem] w-0.5 -translate-x-1/2 bg-runner" />}
      <span aria-hidden className="step-number flex h-8 items-center justify-center text-3xl">
        {number}
      </span>
      <span className="min-w-0">
        <span className="flex min-h-8 items-center font-bold text-bone">{title}</span>
        <span className="block text-dim">{children}</span>
      </span>
    </li>
  )
}
