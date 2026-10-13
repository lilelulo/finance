import { reactive } from 'vue'

export interface Choice<T = unknown> { label: string, value: T, desc?: string, kind?: 'danger' }
interface Pending {
  id: number
  title: string
  message: string
  choices: Choice[]
  stacked: boolean
  resolve: (v: any) => void
}

/* Petites fenêtres de confirmation / de choix (remplacent confirm()). */
const queue = reactive<Pending[]>([])
let seq = 0

export function useChoice() {
  function ask<T>(title: string, message: string, choices: Choice<T>[], opts: { stacked?: boolean } = {}): Promise<T | null> {
    return new Promise(resolve => queue.push({ id: ++seq, title, message, choices, stacked: !!opts.stacked, resolve }))
  }
  const confirmDanger = (title: string, message: string, label = 'Supprimer') =>
    ask(title, message, [{ label, value: true, kind: 'danger' }])
  function settle(item: Pending, value: unknown) {
    const i = queue.indexOf(item)
    if (i >= 0) queue.splice(i, 1)
    item.resolve(value)
  }
  const cancelAll = () => [...queue].forEach(item => settle(item, null))
  return { queue, ask, confirmDanger, settle, cancelAll }
}
