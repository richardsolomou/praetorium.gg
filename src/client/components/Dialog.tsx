import { XIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogFooter as GeneratedDialogFooter,
  DialogContent as GeneratedDialogContent,
  DialogHeader as GeneratedDialogHeader,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export { Dialog, DialogClose, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

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
 * full height on wide screens too, for a body that lays out its own scrolling regions.
 */
export function DialogContent({
  size = 'sm',
  fill = false,
  actions,
  showCloseButton = true,
  className,
  children,
  ...props
}: ComponentProps<typeof GeneratedDialogContent> & { size?: keyof typeof SIZES; fill?: boolean; actions?: ReactNode }) {
  return (
    <GeneratedDialogContent
      {...props}
      showCloseButton={false}
      className={cn(
        'flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-4rem)]',
        fill && 'sm:h-[calc(100dvh-4rem)]',
        SIZES[size],
        ACTIONS_INSET[Number(Boolean(actions)) + Number(showCloseButton)],
        className,
      )}
    >
      {children}
      {actions || showCloseButton ? (
        <div className="absolute top-[calc(0.5rem+env(safe-area-inset-top))] right-2 flex gap-2">
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
  return <GeneratedDialogFooter className={cn('m-0 shrink-0', className)} {...props} />
}
