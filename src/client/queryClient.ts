import { createStackQueryClient, queryErrorMessage } from 'ras-stack/tanstack/query'

export function createQueryClient() {
  return createStackQueryClient()
}

export const errorMessage = queryErrorMessage
