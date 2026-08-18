import { createContext, type ReactNode, useContext } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Keyword, type KeywordRule } from './Keyword'

const noRules: KeywordRule[] = []
const Rules = createContext<KeywordRule[]>(noRules)
const components: Components = {
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  hr: () => <Separator className="bg-edge" />,
  strong: RuleReference,
}

export function RuleText({ text, rules = noRules, className }: { text: string; rules?: KeywordRule[]; className?: string }) {
  const cleaned = text.replaceAll('^^', '')
  const markdown = cleaned.replaceAll(/(?<!\*)\[([\p{L}\p{N} +'"’\p{Pd}]+)\](?!\*)/gu, '**[$1]**')
  return (
    <Rules value={rules}>
      <div className={cn('mt-2 space-y-2 font-rules text-sm text-dim', className)}>
        <Markdown components={components}>{markdown}</Markdown>
      </div>
    </Rules>
  )
}

function RuleReference({ children }: { children?: ReactNode }) {
  const rules = useContext(Rules)
  const name = typeof children === 'string' ? children : null
  return <strong className="font-semibold text-bone">{name ? <Keyword name={name} rules={rules} /> : children}</strong>
}
