import { reactive, ref } from 'vue'
import * as core from '~/utils/budget-core'
import type { BudgetState, Kind } from '~/utils/budget-core'

/* État unique de l'application (partagé par tous les composants).
   Il est chargé et enregistré dans le navigateur par plugins/storage.client.ts. */
const state = reactive(core.emptyState()) as BudgetState
const status = ref<'loading' | 'ok' | 'saving' | 'error' | 'memory'>('loading')
/** Groupes dépliés dans la synthèse (préférence d'affichage). */
const openGroups = reactive(new Set<string>())

export function useBudget() {
  const S = state
  type Id = string | null | undefined
  return {
    S,
    status,
    openGroups,
    replaceState(next: BudgetState) { Object.assign(S, next) },
    // Recherches
    acc: (id: Id) => core.accountOf(S, id),
    grp: (id: Id) => core.groupOf(S, id),
    cat: (id: Id) => core.categoryOf(S, id),
    rec: (id: Id) => core.recurrenceOf(S, id),
    catsOf: (gid: string) => core.categoriesOf(S, gid),
    groupsOf: (kind: Kind) => core.groupsOfKind(S, kind),
    kindOfCat: (id: Id) => core.kindOfCategory(S, id),
    catPath: (id: Id) => core.categoryPath(S, id),
    walletsOf: (aid: Id) => core.walletsOf(S, aid),
    walletOf: (aid: Id, wid: Id) => core.walletOf(S, aid, wid),
    isSavings: (aid: Id) => core.isSavings(S, aid),
    hasWallets: (aid: Id) => core.hasWallets(S, aid),
    // Calculs
    balance: (aid: string, upTo?: string) => core.balance(S, aid, upTo),
    walletBalance: (aid: string, wid: string | null, upTo?: string) => core.walletBalance(S, aid, wid, upTo),
    txnsOfMonth: (mk: string) => core.txnsOfMonth(S, mk),
    planned: (mk: string, cid: string) => core.planned(S, mk, cid),
    hasPlan: (mk: string) => core.hasPlan(S, mk),
    summary: (mk: string, kind: Kind) => core.summary(S, mk, kind),
    uncategorized: (mk: string, type: 'expense' | 'income') => core.uncategorized(S, mk, type),
    plannedTotals: (mk: string) => core.plannedTotals(S, mk),
    occurrencesOf: (id: string) => core.occurrencesOf(S, id),
  }
}
