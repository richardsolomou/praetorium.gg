import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Button styling for an element that is not a `Button`, such as a link. It merges classes the way `Button` does, so a variant or
 * className replaces the base class it conflicts with instead of depending on stylesheet order.
 */
export function buttonClass(props?: Parameters<typeof buttonVariants>[0]) {
  return cn(buttonVariants(props))
}
