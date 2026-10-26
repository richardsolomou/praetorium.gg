import { usePostHog } from '@posthog/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Check, ChevronRight, Circle, Flag, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent } from '@/components/ui/popover'
import {
  EMPTY_ONBOARDING_PROGRESS,
  gettingStartedTaskIds,
  isTourTask,
  resolvedGettingStartedTasks,
  type OnboardingProgress,
  type OnboardingProgressOperation,
  type OnboardingTaskId,
} from '../../../core/onboarding'
import { updateOnboardingProgress } from '../../functions'
import { meQuery, onboardingQuery } from '../../queries'
import { writeSessionValue } from '../../storedValue'
import { useCompactChrome } from '../shell/useCompactChrome'
import {
  FIRST_ONBOARDING_STEP,
  ONBOARDING_ADVANCE_EVENT,
  ONBOARDING_EVENT,
  ONBOARDING_FOCUS_EVENT,
  ONBOARDING_UI,
  focusAfterOnboardingNavigation,
  focusAfterOnboardingOperation,
  nextOnboardingFocus,
  onboardingFocusStorageKey,
  onboardingHrefFor,
  onboardingPage,
  onboardingPromptAtTop,
  onboardingStepEntry,
  onboardingStepPastAbsentTarget,
  gettingStartedTasks,
  storedOnboardingFocus,
  type OnboardingAdvanceEvent,
  type OnboardingFocus,
  type OnboardingPlacement,
  type OnboardingStepId,
} from './onboarding'
import { Problem } from '../../components/Problem'
import { peekGuestDraft } from '../rosters/guestDraft'

/** How long a step waits for its control to appear before the guide offers the page instead. */
const TARGET_WAIT = 1_500

const PLACEMENTS = {
  top: { side: 'top', align: 'center' },
  bottom: { side: 'bottom', align: 'center' },
  'bottom-end': { side: 'bottom', align: 'end' },
  left: { side: 'left', align: 'center' },
  right: { side: 'right', align: 'center' },
} as const satisfies Record<OnboardingPlacement, { side: 'top' | 'bottom' | 'left' | 'right'; align: 'start' | 'center' | 'end' }>

export function OnboardingGuide() {
  const { data: me } = useQuery(meQuery())
  return <AccountOnboardingGuide key={me?.id ?? 'visitor'} userId={me?.id} />
}

function AccountOnboardingGuide({ userId }: { userId?: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const posthog = usePostHog()
  const queryClient = useQueryClient()
  const { data: progress } = useQuery({ ...onboardingQuery(), enabled: Boolean(userId) })
  const data = userId ? progress : EMPTY_ONBOARDING_PROGRESS
  const mutation = useMutation({
    mutationFn: (operation: OnboardingProgressOperation) => updateOnboardingProgress({ data: operation }),
    onSuccess: (saved) => queryClient.setQueryData(onboardingQuery().queryKey, saved),
  })
  const updateProgress = useCallback(
    (operation: OnboardingProgressOperation) => {
      if (userId) mutation.mutate(operation)
    },
    [mutation, userId],
  )
  const storageKey = onboardingFocusStorageKey(userId ?? 'visitor')
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<OnboardingFocus | undefined>(() => storedOnboardingFocus(userId ?? 'visitor'))
  const currentFocus = useRef(focus)
  // Kept with its step, so a step that has just moved on never points at the last step's control.
  const [trackedTarget, setTrackedTarget] = useState<{ step: OnboardingStepId; element: HTMLElement | undefined }>()
  const [atTop, setAtTop] = useState(false)
  const [covered, setCovered] = useState(false)
  // The focus whose control never arrived, rather than a flag, so a step that has moved on, or come back, starts unlost.
  const [lost, setLost] = useState<OnboardingFocus>()
  const compact = useCompactChrome()
  const page = onboardingPage(location.pathname)
  const focusedStep = focus ? ONBOARDING_UI[focus.step] : undefined

  // The ref answers event handlers that run before the next render; storage follows each committed step.
  const rememberFocus = useCallback((next: OnboardingFocus | undefined) => {
    currentFocus.current = next
    setFocus(next)
  }, [])
  useEffect(() => {
    currentFocus.current = focus
    writeSessionValue(storageKey, focus ? JSON.stringify(focus) : null)
  }, [focus, storageKey])
  const arrived = focusAfterOnboardingNavigation(focus, page)
  if (arrived !== focus) setFocus(arrived)
  const target = focusedStep && trackedTarget?.step === focus?.step ? trackedTarget?.element : undefined

  const showStep = useCallback(
    async (next: OnboardingFocus) => {
      rememberFocus(next)
      const href = onboardingHrefFor(next.step, onboardingPage(location.pathname))
      const targetExists = document.querySelector(`[data-onboarding="${ONBOARDING_UI[next.step].target}"]`)
      if (href && !targetExists) await navigate({ href })
    },
    [location.pathname, navigate, rememberFocus],
  )

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<OnboardingFocus | undefined>(ONBOARDING_FOCUS_EVENT, { detail: focus }))
  }, [focus])

  useEffect(() => {
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [target])

  useEffect(() => {
    const advance = (event: Event) => {
      const next = nextOnboardingFocus(currentFocus.current, (event as CustomEvent<OnboardingAdvanceEvent>).detail)
      if (next !== currentFocus.current) rememberFocus(next)
    }
    window.addEventListener(ONBOARDING_ADVANCE_EVENT, advance)
    return () => window.removeEventListener(ONBOARDING_ADVANCE_EVENT, advance)
  }, [rememberFocus])

  const targetLost = useEffectEvent((waiting: OnboardingFocus) => {
    setLost(waiting)
    const next = focus === waiting && onboardingStepPastAbsentTarget(waiting.step)
    if (next) void showStep({ task: waiting.task, step: next })
  })

  useEffect(() => {
    if (!focus || !focusedStep) return
    const waiting = focus
    const step = focus.step
    const selector = `[data-onboarding="${focusedStep.target}"]`
    let frame = 0
    let waited = 0
    const refresh = () => {
      frame = 0
      const element = [...document.querySelectorAll<HTMLElement>(selector)].find(
        (match) => match.getClientRects().length > 0 && !match.closest('[inert]'),
      )
      setTrackedTarget((current) => (current?.step === step && current.element === element ? current : { step, element }))
      setCovered([...document.querySelectorAll('[data-slot="dialog-content"]')].some((dialog) => !dialog.contains(element ?? null)))
      setAtTop(onboardingPromptAtTop(element?.getBoundingClientRect().bottom, window.innerHeight))
      if (element) {
        // A control that goes away while the page settles is waited for again rather than given up on.
        clearTimeout(waited)
        waited = 0
        setLost(undefined)
      } else waited ||= window.setTimeout(() => targetLost(waiting), TARGET_WAIT)
    }
    // One answer a frame: the roster builder rewrites this subtree constantly while it saves.
    const schedule = () => {
      frame ||= requestAnimationFrame(refresh)
    }
    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      clearTimeout(waited)
    }
  }, [focus, focusedStep])

  /*
   * A prompt either points at the control it describes or, where it cannot, sits
   * where the panel sits. Compact screens are the second case: a pane fills them,
   * so a popup beside it has nowhere to go, and `lost` is the control never arriving.
   * A compact card also waits while a full-screen dialog hides its control.
   */
  const placed = target ? (!compact ? 'anchor' : covered ? undefined : 'card') : lost && lost === focus ? 'lost' : undefined
  const prompted = !open && focusedStep ? placed : undefined
  const anchored = prompted === 'anchor' ? target : undefined

  useEffect(() => {
    if (!target || !prompted || prompted === 'lost') return
    target.setAttribute('data-onboarding-active', 'true')
    return () => target.removeAttribute('data-onboarding-active')
  }, [prompted, target])

  useEffect(() => {
    if (!prompted || !focus) return
    posthog.capture('onboarding_task_viewed', { task: focus.task, step: focus.step })
  }, [focus, posthog, prompted])

  const dismiss = useCallback(() => {
    if (focus) posthog.capture('onboarding_task_paused', { task: focus.task, step: focus.step })
    rememberFocus(undefined)
  }, [focus, posthog, rememberFocus])

  useEffect(() => {
    if (!prompted) return
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && dismiss()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [dismiss, prompted])

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next && data && !data.welcomed) updateProgress({ operation: 'welcome' })
  }

  const updateTask = (operation: OnboardingProgressOperation) => {
    const next = focusAfterOnboardingOperation(focus, operation)
    if (next !== focus) rememberFocus(next)
    updateProgress(operation)
  }

  const launch = async (task: OnboardingTaskId, step?: OnboardingStepId) => {
    if (!data?.welcomed) updateProgress({ operation: 'welcome' })
    setOpen(false)
    posthog.capture('onboarding_task_started', { task })
    const guest = !userId && task === 'roster' && (!step || step === 'roster-start') ? peekGuestDraft() : null
    if (guest) {
      rememberFocus({ task, step: guest.draft.picks.length ? 'roster-list' : 'roster-picker' })
      await navigate({ to: '/rosters/$id', params: { id: guest.id } })
      return
    }
    // A tour the player left half-finished resumes where it stopped.
    await showStep(step ? { task, step } : focus?.task === task ? focus : { task, step: FIRST_ONBOARDING_STEP[task] })
  }

  const openGuide = useEffectEvent((event: Event) => {
    const requested = (event as CustomEvent<OnboardingFocus | undefined>).detail
    if (requested) void launch(requested.task, requested.step)
    else setOpen(true)
  })
  useEffect(() => {
    const show = (event: Event) => openGuide(event)
    window.addEventListener(ONBOARDING_EVENT, show)
    return () => window.removeEventListener(ONBOARDING_EVENT, show)
  }, [])

  useEffect(() => {
    if (open) posthog.capture('onboarding_guide_opened', { signed_in: Boolean(userId) })
  }, [open, posthog, userId])

  const finish = () => {
    if (!focus) return
    const completed = () => {
      posthog.capture('onboarding_walkthrough_finished', { task: focus.task, signed_in: Boolean(userId) })
      if (currentFocus.current === focus) rememberFocus(undefined)
    }
    if (!userId || !isTourTask(focus.task)) return completed()
    mutation.mutate(
      { operation: 'complete', task: focus.task },
      {
        onSuccess: completed,
      },
    )
  }

  if (!data) return null

  const next = focusedStep?.next
  const prompt =
    focus && focusedStep ? (
      <GuidePrompt
        step={focusedStep}
        stranded={prompted === 'lost'}
        onDismiss={dismiss}
        onFinish={focusedStep.final ? finish : undefined}
        saving={mutation.isPending}
        problem={mutation.isError ? 'Could not save your progress. Try again.' : undefined}
        onAdvance={
          next && focusedStep.nextLabel
            ? { label: focusedStep.nextLabel, run: () => void showStep({ task: focusedStep.task, step: next }) }
            : undefined
        }
        onOpenPage={() => void showStep({ task: focusedStep.task, step: onboardingStepEntry(focus.step) })}
      />
    ) : null
  const placement = focusedStep ? PLACEMENTS[focusedStep.placement] : PLACEMENTS.bottom
  const setupPrompt = focus?.step.startsWith('battle-setup-')

  return (
    <>
      <GuidePanel
        data={data}
        signedIn={Boolean(userId)}
        open={open}
        busy={mutation.isPending}
        onClose={() => changeOpen(false)}
        onLaunch={launch}
        onUpdate={updateTask}
      />
      {anchored ? (
        <Popover open modal={false}>
          <PopoverContent
            ref={(element) => {
              // The portal is a child of `body`, where a compact roster pane makes every sibling inert.
              element?.closest('body > *')?.setAttribute('data-inert-exempt', '')
            }}
            anchor={anchored}
            side={placement.side}
            align={placement.align}
            sideOffset={10}
            initialFocus={false}
            finalFocus={false}
            className="w-[min(20rem,calc(100vw-2rem))] gap-0 border-2 border-info/50 bg-panel p-3 text-bone shadow-xl"
          >
            {prompt}
          </PopoverContent>
        </Popover>
      ) : null}
      {/* On `body` and above a dialog: a phone reads setup inside one, and a compact pane makes every sibling inert. */}
      {prompted === 'card' || prompted === 'lost'
        ? createPortal(
            <div
              data-inert-exempt
              className={`fixed inset-x-4 z-[60] mx-auto w-[min(20rem,calc(100vw-2rem))] border-2 border-info/50 bg-panel p-3 text-bone shadow-xl min-[860px]:inset-x-auto min-[860px]:top-auto min-[860px]:right-4 ${
                // Battle setup pins its section index under the header and its Start bar at the foot.
                setupPrompt ? 'min-[860px]:bottom-[5.5rem]' : 'min-[860px]:bottom-4'
              } ${
                atTop
                  ? setupPrompt
                    ? 'top-[calc(7.5rem+env(safe-area-inset-top))]'
                    : 'top-[calc(4rem+env(safe-area-inset-top))]'
                  : setupPrompt
                    ? 'bottom-[calc(9rem+env(safe-area-inset-bottom))]'
                    : 'bottom-[calc(5rem+env(safe-area-inset-bottom))]'
              }`}
            >
              {prompt}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function GuidePrompt({
  step,
  stranded,
  onAdvance,
  onDismiss,
  onFinish,
  onOpenPage,
  saving,
  problem,
}: {
  step: (typeof ONBOARDING_UI)[OnboardingStepId]
  stranded: boolean
  onAdvance?: { label: string; run: () => void }
  onDismiss: () => void
  onFinish?: () => void
  onOpenPage: () => void
  saving: boolean
  problem?: string
}) {
  return (
    <section role="note" aria-live="polite" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-info">Getting started</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-mt-2 -mr-2"
          aria-label="Close onboarding prompt"
          onClick={onDismiss}
        >
          <X />
        </Button>
      </div>
      <h2 className="font-semibold">{step.title}</h2>
      <p className="mt-1 text-xs leading-snug text-dim">{step.description}</p>
      {stranded ? (
        <Button type="button" size="sm" className="mt-3 w-full" onClick={onOpenPage}>
          Take me there <ChevronRight />
        </Button>
      ) : onAdvance ? (
        <Button type="button" size="sm" className="mt-3 w-full" onClick={onAdvance.run}>
          {onAdvance.label} <ChevronRight />
        </Button>
      ) : onFinish ? (
        <Button type="button" size="sm" className="mt-3 w-full" onClick={onFinish} disabled={saving}>
          <Check /> Finish tour
        </Button>
      ) : null}
      {problem && <Problem className="mt-2 text-xs">{problem}</Problem>}
    </section>
  )
}

function GuidePanel({
  data,
  signedIn,
  open,
  busy,
  onClose,
  onLaunch,
  onUpdate,
}: {
  data: OnboardingProgress
  signedIn: boolean
  open: boolean
  busy: boolean
  onClose: () => void
  onLaunch: (task: OnboardingTaskId) => void
  onUpdate: (operation: OnboardingProgressOperation) => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (open) heading.current?.focus()
  }, [open])
  if (!open) return null
  const resolved = resolvedGettingStartedTasks(data)
  return (
    <dialog
      open
      aria-modal="false"
      aria-labelledby="onboarding-guide-title"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-50 flex max-h-[calc(100dvh-7rem)] w-auto flex-col overflow-hidden border border-edge bg-panel text-sm text-bone shadow-xl min-[860px]:bottom-4 min-[860px]:left-auto min-[860px]:max-h-[calc(100dvh-2rem)] min-[860px]:w-[32rem]"
    >
      <div className="relative border-b border-edge bg-sunken p-4 pr-12">
        <p className="eyebrow text-info">Getting started</p>
        <h2 id="onboarding-guide-title" ref={heading} tabIndex={-1} className="mt-2 text-xl text-bone outline-none">
          Your first army and matchup
        </h2>
        <p className="mt-2 text-dim">
          {signedIn
            ? 'Build or import an army, then try a matchup. Your progress follows your account.'
            : 'Build or import an army, then try a matchup. No account needed; this device keeps your army until you sign in to save it.'}
        </p>
        {signedIn ? (
          <p className="mt-2 text-xs text-dim">
            {resolved.length} of {gettingStartedTaskIds.length} complete or skipped
          </p>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2"
          aria-label="Close getting started"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="grid min-h-0 gap-2 overflow-y-auto p-3">
        {gettingStartedTaskIds.map((id) => {
          const task = gettingStartedTasks[id]
          const completed = data.completedTasks.includes(id)
          const skipped = data.skippedTasks.includes(id)
          return (
            <section key={id} className="border border-edge p-3" aria-label={id === 'roster' ? 'Build or import an army' : task.title}>
              <div className="flex items-start gap-2">
                {completed ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-info" />
                ) : skipped ? (
                  <Circle className="mt-0.5 size-4 shrink-0 text-faint" />
                ) : (
                  <Flag className="mt-0.5 size-4 shrink-0 text-info" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{id === 'roster' ? 'Build or import an army' : task.title}</h3>
                  <p className="mt-1 text-xs text-dim">
                    {completed
                      ? 'Complete · Reopen the guide whenever you need it.'
                      : skipped
                        ? 'Skipped · Try it whenever you are ready.'
                        : id === 'roster'
                          ? 'Start from scratch, or bring a list from your army builder.'
                          : task.description}
                  </p>
                </div>
                {signedIn && !completed ? (
                  skipped ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={'Restore ' + task.title}
                      onClick={() => onUpdate({ operation: 'restore', task: id })}
                    >
                      <RotateCcw />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={'Skip ' + task.title}
                      onClick={() => onUpdate({ operation: 'skip', task: id })}
                    >
                      Skip
                    </Button>
                  )
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onLaunch(id)}>
                  {task.title}
                </Button>
                {id === 'roster' ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onLaunch('roster-tools')}>
                    Import an existing army
                  </Button>
                ) : null}
              </div>
            </section>
          )
        })}
        <p className="text-xs text-dim">Battle, friend, and tournament guides are available on their own pages.</p>
      </div>
    </dialog>
  )
}
