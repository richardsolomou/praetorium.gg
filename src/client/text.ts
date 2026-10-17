export { formatList } from '../core/text'

export const countLabel = (total: number, one: string, many = `${one}s`) => `${total} ${total === 1 ? one : many}`

export const percentLabel = (rate: number) => `${Math.round(rate * 100)}%`
