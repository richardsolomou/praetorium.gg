import { XIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogFooter as GeneratedDialogFooter,
  DialogContent as GeneratedDialogContent,
  DialogHeader as GeneratedDialogHeader,
} from '@/components/ui/dialog'
import { DrawerContent } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

export { Dialog, DialogClose, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
export { Drawer, DrawerTrigger } from '@/components/ui/drawer'

const SIZES = {
  sm: 'sm:max-w-lg',
  md: 'sm:max-w-3xl',
  lg: 'sm:max-w-[min(64rem,calc(100%-2rem))]',
}

/** Room the header leaves for zero, one or two header buttons. */
const ACTIONS_INSET = ['[--dialog-actions:1rem]', '[--dialog-actions:3rem]', '[--dialog-actions:5.5rem]']

/**
 * A dialog that keeps its header, header actions and footer in place while only its body scrolls.
 *
 * Compact screens show it full screen; `src/styles.css` owns that geometry. `fill` holds the
 * full height on wide screens too, for a body that lays out its own scrolling regions. `fit`
 * keeps a short dialog sized to its content on compact screens as well, as a confirmation is.
 */
export function DialogContent({
  size = 'sm',
  fill = false,
  fit = false,
  actions,
  showCloseButton = true,
  className,
  children,
  ...props
}: ComponentProps<typeof GeneratedDialogContent> & {
  size?: keyof typeof SIZES
  fill?: boolean
  fit?: boolean
  actions?: ReactNode
}) {
  return (
    <GeneratedDialogContent
      {...props}
      data-fit={fit || undefined}
      showCloseButton={false}
      // Clipped rather than hidden: a hidden box still scrolls when focus or scrollIntoView reaches past it, shifting the header and footer.
      className={cn(
        'flex flex-col gap-0 overflow-clip p-0 sm:max-h-[calc(100dvh-4rem)]',
        fill && 'sm:h-[calc(100dvh-4rem)]',
        SIZES[size],
        ACTIONS_INSET[Number(Boolean(actions)) + Number(showCloseButton)],
        className,
      )}
    >
      {children}
      {actions || showCloseButton ? (
        <div className={cn('absolute right-2 flex gap-2', fit ? 'top-2' : 'top-[calc(0.5rem+env(safe-area-inset-top))]')}>
          {actions}
          {showCloseButton ? (
            <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
              <XIcon />
            </DialogClose>
          ) : null}
        </div>
      ) : null}
    </GeneratedDialogContent>
  )
}

/**
 * `DialogContent` as a drawer rising from the foot of the screen, sized to its content, for a phone held in one hand.
 * Its header and footer stay put while the body scrolls, and a swipe down closes it. The dialog's title, description
 * and close button work inside it, because a drawer is a dialog underneath.
 */
export function SheetContent({
  actions,
  showCloseButton = true,
  className,
  children,
  ...props
}: ComponentProps<typeof DrawerContent> & { actions?: ReactNode; showCloseButton?: boolean }) {
  return (
    <DrawerContent
      {...props}
      className={cn(
        'border-edge bg-panel pb-[env(safe-area-inset-bottom)] data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-var(--app-header)-env(safe-area-inset-top)-1rem)]',
        ACTIONS_INSET[Number(Boolean(actions)) + Number(showCloseButton)],
        className,
      )}
    >
      {children}
      {actions || showCloseButton ? (
        <div className="absolute top-5 right-2 flex gap-2">
          {actions}
          {showCloseButton ? (
            <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
              <XIcon />
            </DialogClose>
          ) : null}
        </div>
      ) : null}
    </DrawerContent>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<typeof GeneratedDialogHeader>) {
  return <GeneratedDialogHeader className={cn('shrink-0 border-b border-edge py-4 pr-(--dialog-actions) pl-4', className)} {...props} />
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        'grid min-h-0 min-w-0 flex-auto grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto overscroll-contain p-4 empty:hidden',
        className,
      )}
      {...props}
    />
  )
}

export function DialogFooter({ className, ...props }: ComponentProps<typeof GeneratedDialogFooter>) {
  return <GeneratedDialogFooter className={cn('m-0 mt-auto shrink-0', className)} {...props} />
}
