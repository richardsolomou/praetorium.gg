import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { MissionObjectiveRef, MissionSelection } from '../../../core/missionSelections'
import { KOTC_MATCHUP_ID, type Deployment } from '../../../contracts/terrain'
import { isKotcLimit, type Command } from '../../../core/battle'
import type { BattleView, MissionChoiceView } from '../../../core/battleView'
import { terrainMatchupIds, terrainReferencesQuery } from '../../queries'
import { SearchableSelect } from '../../components/SearchableSelect'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { deploymentObjectiveMarkers, objectiveTerrainMarkers } from '../reference/missions/terrainGeometry'
import { battlefieldLayout } from './battlefieldLayout'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import type { ReferenceCard } from './MissionCards'
import { MissionCardReference } from '../../components/MissionCardReference'
import { missionUnitChoice, missionUnitChoiceKey } from './missionUnitChoice'
import { UndoLatestButton, UndoLatestConfirmation, useUndoLatest } from './UndoLatest'

export function MissionSelectionDialog({
  view,
  choice,
  deployment,
  pending,
  send,
  reference,
  onClose,
}: {
  view: BattleView
  choice: MissionChoiceView
  deployment: Deployment | null
  pending: boolean
  send: (command: Command) => void
  reference?: ReferenceCard
  onClose?: () => void
}) {
  const manualId = useId()
  const noteId = useId()
  const undo = useUndoLatest({ undoable: view.undoable, undoableDraw: view.undoableDraw, send })
  const records = view.players.find((player) => player.id === choice.playerId)?.missionSelections ?? []
  const latest = records.find((record) => record.cardKey === choice.cardKey && record.occurrence === choice.occurrence)
  const [openedAt] = useState(latest?.seq ?? 0)
  useEffect(() => {
    if (latest && latest.seq > openedAt) onClose?.()
  }, [latest, openedAt, onClose])
  const [selected, setSelected] = useState<string[]>([])
  const [fallback, setFallback] = useState(false)
  const [qualified, setQualified] = useState(false)
  const [notHome, setNotHome] = useState(false)
  const [noMansLand, setNoMansLand] = useState(false)
  const [objective, setObjective] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualObjectives, setManualObjectives] = useState<MissionObjectiveRef[]>([])
  const [guards, setGuards] = useState<Record<string, string>>({})
  const [beacon, setBeacon] = useState(() => {
    const saved = latest?.selection.kind === 'beacon' ? latest.selection.unit : null
    return saved ? missionUnitChoiceKey(saved) : ''
  })
  const [note, setNote] = useState(latest?.selection.kind === 'beacon' ? latest.selection.note : '')
  const matchups = isKotcLimit(view.settings.limit)
    ? [KOTC_MATCHUP_ID]
    : terrainMatchupIds(view.players.flatMap((player) => (player.disposition ? [player.disposition] : [])))
  const query = terrainReferencesQuery(matchups)
  const terrain = useQuery({ ...query, enabled: Boolean(view.settings.terrainLayoutId) && query.enabled })
  const layout = battlefieldLayout(view.settings.terrainLayoutId, terrain.data?.layouts)
  const objectives: MissionObjectiveRef[] =
    !deployment || (view.settings.terrainLayoutId && !layout)
      ? []
      : [
          ...deploymentObjectiveMarkers(layout?.geometry ?? null, deployment.objectives).map((_, index) => ({
            key: `deployment-${index}`,
            name: `Objective ${index + 1}`,
          })),
          ...(layout?.geometry
            ? objectiveTerrainMarkers(layout.geometry).map((marker, index) => ({
                key: marker.key,
                name: marker.key === 'group-center' ? 'Centre objective' : `Objective ${index + 1}`,
              }))
            : []),
        ]
  const named = manualName.trim()
  const manual = named ? { key: `manual-${named.toLocaleLowerCase()}`, name: named } : null
  const pickedObjective = objectives.find((candidate) => candidate.key === objective) ?? (!objectives.length ? manual : null)
  const unitOptions = choice.units.map((unit) => ({
    value: missionUnitChoiceKey(unit),
    label: `${view.players.find((player) => player.id === unit.playerId)?.name ?? 'Army'} · ${unit.name}`,
  }))
  const ref = (key: string) => missionUnitChoice(choice.units, key)
  let selection: MissionSelection | null = null
  if (choice.kind === 'punishment' && !choice.units.length)
    selection = { kind: 'punishment', units: [], fallback: false, qualified: false, unavailable: true }
  else if (
    choice.kind === 'punishment' &&
    qualified &&
    selected.length > 0 &&
    selected.length <= (fallback ? 1 : 3) &&
    selected.every((key) => ref(key))
  )
    selection = { kind: 'punishment', units: selected.flatMap((key) => ref(key) ?? []), fallback, qualified }
  else if (choice.kind === 'guards') {
    const available = [...objectives, ...manualObjectives]
    selection = Object.values(guards).some((key) => key && !ref(key))
      ? null
      : {
          kind: 'guards',
          guards: available.flatMap((candidate) =>
            guards[candidate.key] && ref(guards[candidate.key]!) ? [{ objective: candidate, unit: ref(guards[candidate.key]!)! }] : [],
          ),
        }
  } else if (choice.kind === 'tempting-target' && pickedObjective && notHome && noMansLand)
    selection = { kind: 'tempting-target', objective: pickedObjective, notHome, noMansLand }
  else if (choice.kind === 'beacon' && ref(beacon)) selection = { kind: 'beacon', unit: ref(beacon), note }
  const staleUnits =
    selected.some((key) => !ref(key)) || Object.values(guards).some((key) => key && !ref(key)) || Boolean(beacon && !ref(beacon))
  const chooseUnit = (value: string, onValueChange: (value: string) => void, label: string) => (
    <SearchableSelect
      ariaLabel={label}
      groups={[{ label: 'Units', items: [...(choice.kind === 'guards' ? [{ value: '', label: 'No guard' }] : []), ...unitOptions] }]}
      value={value}
      onValueChange={onValueChange}
      placeholder="Select a unit"
      disabled={pending}
    />
  )
  return (
    <>
      <BattlePromptDialog
        open
        minimizedLabel={choice.cardName}
        onOpenChange={(open) => {
          if (!open) onClose?.()
        }}
      >
        <BattleDialogContent showCloseButton={Boolean(onClose)} minimizeDisabled={pending}>
          <DialogHeader>
            <DialogTitle>{choice.cardName} · choices</DialogTitle>
            <DialogDescription>
              {choice.kind === 'beacon'
                ? 'Manual tracking. Check the card’s timing and eligibility at the table. This records a choice without awarding points.'
                : 'Record the choice at the table. Scoring still needs your confirmation.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {staleUnits ? (
              <div className="space-y-2">
                <p className="text-sm">A selected unit or roster changed. Choose again before saving.</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setSelected([])
                    setGuards({})
                    setBeacon('')
                    setQualified(false)
                  }}
                >
                  Clear changed choices
                </Button>
              </div>
            ) : null}
            {reference ? (
              <details>
                <summary className="cursor-pointer text-info">Read the mission card</summary>
                <MissionCardReference card={reference} type="Mission" />
              </details>
            ) : null}
            {choice.kind === 'punishment' ? (
              <>
                <p className="text-sm">
                  {choice.units.length
                    ? 'Choose one to three enemy units on the battlefield.'
                    : 'No tracked enemy unit is on the battlefield. Record this without a target.'}
                </p>
                {choice.units.length ? (
                  <>
                    <FactSwitch
                      label="No enemy unit qualifies; use the one-unit fallback"
                      checked={fallback}
                      disabled={pending}
                      onChange={(next) => {
                        setFallback(next)
                        setQualified(false)
                        if (next) setSelected((current) => current.slice(0, 1))
                      }}
                    />
                    <p className="eyebrow">{selected.length} selected</p>
                    {unitOptions.map((unit) => (
                      <Button
                        key={unit.value}
                        variant={selected.includes(unit.value) ? 'default' : 'outline'}
                        aria-pressed={selected.includes(unit.value)}
                        className="h-auto justify-start whitespace-normal"
                        disabled={pending || (!selected.includes(unit.value) && selected.length >= (fallback ? 1 : 3))}
                        onClick={() => {
                          setQualified(false)
                          setSelected((current) =>
                            current.includes(unit.value)
                              ? current.filter((candidate) => candidate !== unit.value)
                              : [...current, unit.value],
                          )
                        }}
                      >
                        {unit.label}
                      </Button>
                    ))}
                    <FactSwitch
                      label={
                        fallback
                          ? 'I confirm no enemy unit meets either qualification'
                          : 'Each chosen unit is within objective range or destroyed a friendly unit in the previous turn'
                      }
                      checked={qualified}
                      disabled={pending}
                      onChange={setQualified}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {choice.kind === 'guards' || choice.kind === 'tempting-target' ? (
              <>
                {!objectives.length ? (
                  <label htmlFor={manualId} className="space-y-1 text-sm">
                    Objective name at the table
                    <Input
                      id={manualId}
                      aria-label="Objective name at the table"
                      maxLength={80}
                      value={manualName}
                      disabled={pending}
                      onChange={(event) => {
                        setManualName(event.target.value)
                        setNotHome(false)
                        setNoMansLand(false)
                      }}
                    />
                  </label>
                ) : null}
                {choice.kind === 'tempting-target' ? (
                  <>
                    {objectives.length ? (
                      <SearchableSelect
                        ariaLabel="Tempting target objective"
                        groups={[
                          { label: 'Objectives', items: objectives.map((candidate) => ({ value: candidate.key, label: candidate.name })) },
                        ]}
                        value={objective}
                        onValueChange={(key) => {
                          setObjective(key)
                          setNotHome(false)
                          setNoMansLand(false)
                        }}
                        placeholder="Choose an objective"
                        disabled={pending}
                      />
                    ) : null}
                    <FactSwitch label="This is not a home objective" checked={notHome} disabled={pending} onChange={setNotHome} />
                    <FactSwitch
                      label="This objective is within No Man’s Land"
                      checked={noMansLand}
                      disabled={pending}
                      onChange={setNoMansLand}
                    />
                  </>
                ) : (
                  <>
                    <p className="text-sm">Guards are optional. One unit can guard more than one objective.</p>
                    {!objectives.length ? (
                      <Button
                        variant="outline"
                        disabled={
                          pending ||
                          !manual ||
                          manualObjectives.length >= 20 ||
                          manualObjectives.some((candidate) => candidate.key === manual?.key)
                        }
                        onClick={() => {
                          if (manual) {
                            setManualObjectives((current) => [...current, manual])
                            setManualName('')
                          }
                        }}
                      >
                        Add table objective
                      </Button>
                    ) : null}
                    {[...objectives, ...manualObjectives].map((candidate) => (
                      <div key={candidate.key} className="space-y-1">
                        <p className="eyebrow">{candidate.name}</p>
                        {chooseUnit(
                          guards[candidate.key] ?? '',
                          (value) => setGuards((current) => ({ ...current, [candidate.key]: value })),
                          `Guard for ${candidate.name}`,
                        )}
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : null}
            {choice.kind === 'beacon' ? (
              <>
                {chooseUnit(beacon, setBeacon, 'Beacon unit')}
                <label htmlFor={noteId} className="space-y-1 text-sm">
                  Table note
                  <Input
                    id={noteId}
                    aria-label="Beacon table note"
                    maxLength={200}
                    value={note}
                    disabled={pending}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <UndoLatestButton disabled={pending || view.undoable === null} onClick={undo.request} />
            <Button
              disabled={pending || !selection}
              onClick={() => {
                if (selection)
                  send({
                    kind: 'select-mission',
                    playerId: choice.playerId,
                    cardKey: choice.cardKey,
                    occurrence: choice.occurrence,
                    selection,
                  })
              }}
            >
              Record choice
            </Button>
          </DialogFooter>
        </BattleDialogContent>
      </BattlePromptDialog>
      <UndoLatestConfirmation pending={pending} control={undo} />
    </>
  )
}

function FactSwitch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  )
}
