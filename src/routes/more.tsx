import { createFileRoute } from '@tanstack/react-router'
import { NativeMorePage } from '../client/features/shell/NativeMorePage'

export const Route = createFileRoute('/more')({
  component: NativeMorePage,
})
