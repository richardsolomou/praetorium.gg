import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { MissionObjectiveRef, MissionSelection } from '../../../core/missionSelections'
import type { Command } from '../../../core/battle'
import type { BattleView, MissionChoiceView } from '../../../core/battleView'
import { deploymentsQuery, terrainReferencesQuery } from '../../queries'
import { deploymentFor } from '../../battleSummary'
import { SearchableSelect } from '../../components/SearchableSelect'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { deploymentObjectiveMarkers, objectiveNames, objectiveTerrainMarkers } from '../reference/missions/terrainGeometry'
import { battleMatchupIds, battlefieldLayout } from './battlefieldLayout'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import type { ReferenceCard } from './MissionCards'
import { MissionCardReference } from '../../components/MissionCardReference'
import { missionUnitChoice, missionUnitChoiceKey } from './missionUnitChoice'
import { UndoLatest } from './UndoLatest'
import { withMember } from '../../../core/collections'

export function MissionSelectionDialog({
  view,
  choice,
  pending,
  send,
  reference,
  onClose,
  onRecorded,
}: {
  view: BattleView
  choice: MissionChoiceView
  pending: boolean
  send: (command: Command) => void
  reference?: ReferenceCard
  onClose: () => void
  /** For a choice that stays open once recorded, such as a Beacon that can be moved. */
  onRecorded?: () => void
}) {
  const manualId = useId()
  const noteId = useId()
  const records = view.players.find((player) => player.id === choice.playerId)?.missionSelections ?? []
  const latest = records.find(
    (record) => record.cardKey === choice.cardKey && record.occurrence === choice.occurrence && record.selection.kind === choice.kind,
  )
  const [openedAt] = useState(latest?.seq ?? 0)
  useEffect(() => {
    if (latest && latest.seq > openedAt) onRecorded?.()
  }, [latest, openedAt, onRecorded])
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
  const [areaName, setAreaName] = useState('')
  const [areas, setAreas] = useState<MissionObjectiveRef[]>([])
  const [outsideZone, setOutsideZone] = useState(false)
  const [allEligible, setAllEligible] = useState(false)
  const [sweptMarker, setSweptMarker] = useState('')
  const [controlled, setControlled] = useState(false)
  const query = terrainReferencesQuery(battleMatchupIds(view))
  const terrain = useQuery({ ...query, enabled: Boolean(view.settings.terrainLayoutId) && query.enabled })
  const layout = battlefieldLayout(view.settings.terrainLayoutId, terrain.data?.layouts)
  const deployment = deploymentFor(view.deploymentId, useQuery(deploymentsQuery()).data)
  const markers =
    !deployment || (view.settings.terrainLayoutId && !layout)
      ? []
      : [
          ...deploymentObjectiveMarkers(layout?.geometry ?? null, deployment.objectives).map((marker, index) => ({
            key: `deployment-${index}`,
            position: marker.position,
          })),
          ...(layout?.geometry ? objectiveTerrainMarkers(layout.geometry) : []),
        ]
  const viewer = !view.attackerId || choice.playerId === view.attackerId ? 'attacker' : 'defender'
  const attacker = view.players.find((player) => player.id === view.attackerId)
  const defender = attacker && view.players.find((player) => player.id !== attacker.id)
  const owner = (role: string) => (role === 'attacker' ? (attacker?.name ?? 'Attacker') : (defender?.name ?? 'Defender'))
  const names = objectiveNames(
    deployment?.zones ?? [],
    markers.map((marker) => marker.position),
    viewer,
    owner,
  )
  const objectives: MissionObjectiveRef[] = markers.map((marker, index) => ({ key: marker.key, name: names[index]! }))
  const consecrated = new Set(choice.consecrated?.map((candidate) => candidate.key))
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
  else if (choice.kind === 'guards' || choice.kind === 'consecrate') {
    const pairs = [...objectives, ...manualObjectives].flatMap((candidate) =>
      guards[candidate.key] && ref(guards[candidate.key]!) && !consecrated.has(candidate.key)
        ? [{ objective: candidate, unit: ref(guards[candidate.key]!)! }]
        : [],
    )
    selection = Object.values(guards).some((key) => key && !ref(key))
      ? null
      : choice.kind === 'guards'
        ? { kind: 'guards', guards: pairs }
        : pairs.length && !(qualified && notHome)
          ? null
          : { kind: 'consecrate', consecrations: pairs, qualified, notHome }
  } else if (choice.kind === 'locate-and-deny' && (!areas.length || outsideZone) && (areas.length === 5 || allEligible))
    selection = { kind: 'locate-and-deny', areas, outsideZone, allEligible: areas.length < 5 }
  else if (choice.kind === 'sensor-sweep' && controlled) {
    const picked = choice.markers?.find((candidate) => JSON.stringify([candidate.playerId, candidate.key]) === sweptMarker)
    if (picked) selection = { kind: 'sensor-sweep', marker: { playerId: picked.playerId, key: picked.key, name: picked.name }, controlled }
  } else if (choice.kind === 'tempting-target' && pickedObjective && notHome && noMansLand)
    selection = { kind: 'tempting-target', objective: pickedObjective, notHome, noMansLand }
  else if (choice.kind === 'beacon' && ref(beacon)) selection = { kind: 'beacon', unit: ref(beacon), note }
  const staleUnits =
    selected.some((key) => !ref(key)) || Object.values(guards).some((key) => key && !ref(key)) || Boolean(beacon && !ref(beacon))
  const chooseUnit = (value: string, onValueChange: (value: string) => void, label: string) => (
    <SearchableSelect
      ariaLabel={label}
      groups={[
        {
          label: 'Units',
          items: unitOptions.filter((unit) => unit.value === value || !Object.values(guards).includes(unit.value)),
        },
      ]}
      value={value}
      onValueChange={onValueChange}
      placeholder="Select a unit"
      emptyText="No unit left to choose."
      disabled={pending}
    />
  )
  return (
    <BattlePromptDialog
      open
      minimizedLabel={choice.cardName}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <BattleDialogContent minimizeDisabled={pending}>
        <DialogHeader>
          <DialogTitle>{choice.cardName} · choices</DialogTitle>
          <DialogDescription>
            {choice.kind === 'sensor-sweep'
              ? 'Optional. Removes the chosen operation marker; scoring still asks you separately.'
              : 'Optional. Keeps the choice on the card for reference; scoring still asks you separately.'}
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
                      className="h-auto min-h-10 justify-start py-2 whitespace-normal"
                      disabled={pending || (!selected.includes(unit.value) && selected.length >= (fallback ? 1 : 3))}
                      onClick={() => {
                        setQualified(false)
                        setSelected((current) => withMember(current, unit.value))
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
          {choice.kind === 'guards' || choice.kind === 'tempting-target' || choice.kind === 'consecrate' ? (
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
                    <fieldset aria-label="Tempting target objective" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {objectives.map((candidate) => (
                        <Button
                          key={candidate.key}
                          variant={objective === candidate.key ? 'default' : 'outline'}
                          className="h-auto min-h-8 py-1.5 whitespace-normal"
                          aria-pressed={objective === candidate.key}
                          disabled={pending}
                          onClick={() => {
                            setObjective(candidate.key)
                            setNotHome(false)
                            setNoMansLand(false)
                          }}
                        >
                          {candidate.name}
                        </Button>
                      ))}
                    </fieldset>
                  ) : null}
                  <FactSwitch
                    label="It is in No Man’s Land and not a home objective"
                    checked={notHome && noMansLand}
                    disabled={pending || !pickedObjective}
                    onChange={(next) => {
                      setNotHome(next)
                      setNoMansLand(next)
                    }}
                  />
                </>
              ) : (
                <>
                  <p className="text-sm">
                    {choice.kind === 'guards'
                      ? 'Guards are optional. Each unit guards one objective.'
                      : 'Consecrating is optional. Each consecration unit can consecrate one objective it is within range of.'}
                  </p>
                  {!objectives.length ? (
                    <Button
                      variant="outline"
                      disabled={
                        pending ||
                        !manual ||
                        manualObjectives.length >= 20 ||
                        manualObjectives.some((candidate) => candidate.key === manual?.key) ||
                        consecrated.has(manual.key)
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
                  {[...objectives, ...manualObjectives]
                    .filter((candidate) => !consecrated.has(candidate.key))
                    .map((candidate) => {
                      const label = `${choice.kind === 'guards' ? 'Guard' : 'Consecration unit'} for ${candidate.name}`
                      const pick = (value: string) => {
                        setGuards((current) => ({ ...current, [candidate.key]: value }))
                        setQualified(false)
                        setNotHome(false)
                      }
                      return (
                        <div key={candidate.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-2">
                          <p className="eyebrow">{candidate.name}</p>
                          {chooseUnit(guards[candidate.key] ?? '', pick, label)}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Clear ${label.charAt(0).toLocaleLowerCase()}${label.slice(1)}`}
                            disabled={pending || !guards[candidate.key]}
                            onClick={() => pick('')}
                          >
                            <X />
                          </Button>
                        </div>
                      )
                    })}
                  {choice.consecrated?.length ? (
                    <p className="text-xs text-faint">
                      Already consecrated: {choice.consecrated.map((candidate) => candidate.name).join(', ')}
                    </p>
                  ) : null}
                  {choice.kind === 'consecrate' && Object.values(guards).some(Boolean) ? (
                    <FactSwitch
                      label="Each unit destroyed a unit since it last consecrated, is within range of its objective, and none of these is my home objective"
                      checked={qualified && notHome}
                      disabled={pending}
                      onChange={(next) => {
                        setQualified(next)
                        setNotHome(next)
                      }}
                    />
                  ) : null}
                </>
              )}
            </>
          ) : null}
          {choice.kind === 'locate-and-deny' ? (
            <>
              <p className="text-sm">Name the five terrain areas outside your deployment zone where you placed operation markers.</p>
              <label htmlFor={manualId} className="space-y-1 text-sm">
                Terrain area at the table
                <Input
                  id={manualId}
                  aria-label="Terrain area at the table"
                  maxLength={80}
                  value={areaName}
                  disabled={pending || areas.length >= 5}
                  onChange={(event) => setAreaName(event.target.value)}
                />
              </label>
              <Button
                variant="outline"
                disabled={
                  pending ||
                  !areaName.trim() ||
                  areas.length >= 5 ||
                  areas.some((candidate) => candidate.key === `manual-${areaName.trim().toLocaleLowerCase()}`)
                }
                onClick={() => {
                  const name = areaName.trim()
                  setAreas((current) => [...current, { key: `manual-${name.toLocaleLowerCase()}`, name }])
                  setAreaName('')
                  setOutsideZone(false)
                }}
              >
                Add terrain area
              </Button>
              <p className="eyebrow">{areas.length} of 5 markers</p>
              {areas.map((candidate) => (
                <div key={candidate.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words">{candidate.name}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Remove ${candidate.name}`}
                    onClick={() => {
                      setAreas((current) => current.filter((area) => area.key !== candidate.key))
                      setAllEligible(false)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {areas.length ? (
                <FactSwitch
                  label="Each terrain area is outside my deployment zone"
                  checked={outsideZone}
                  disabled={pending}
                  onChange={setOutsideZone}
                />
              ) : null}
              {areas.length < 5 ? (
                <FactSwitch
                  label="No other terrain area is outside my deployment zone"
                  checked={allEligible}
                  disabled={pending}
                  onChange={setAllEligible}
                />
              ) : null}
            </>
          ) : null}
          {choice.kind === 'sensor-sweep' ? (
            <>
              <SearchableSelect
                ariaLabel="Operation marker to remove"
                groups={[
                  {
                    label: 'Operation markers',
                    items: (choice.markers ?? []).map((candidate) => ({
                      value: JSON.stringify([candidate.playerId, candidate.key]),
                      label: `${view.players.find((player) => player.id === candidate.playerId)?.name ?? 'Army'} · ${candidate.name}`,
                    })),
                  },
                ]}
                value={sweptMarker}
                onValueChange={(value) => {
                  setSweptMarker(value)
                  setControlled(false)
                }}
                placeholder="Choose a marker"
                disabled={pending}
              />
              <FactSwitch
                label="The sweeping unit started within range of a central objective and controls it at the end of my turn"
                checked={controlled}
                disabled={pending}
                onChange={setControlled}
              />
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
          <UndoLatest undo={view} send={send} pending={pending} />
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Skip
          </Button>
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
