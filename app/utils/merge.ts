/**
 * Fusion à trois voies de deux versions du budget modifiées en parallèle
 * (deux appareils), à partir de leur dernière version commune `base`.
 *
 * Chaque élément (compte, groupe, catégorie, série, opération, montant prévu
 * d'une catégorie pour un mois) est fusionné séparément, par identifiant :
 *   - modifié d'un seul côté            → on garde la modification ;
 *   - modifié des deux côtés            → la version de cet appareil l'emporte ;
 *   - supprimé d'un côté, inchangé de l'autre → supprimé ;
 *   - supprimé d'un côté, modifié de l'autre  → la modification est conservée.
 * Les entrées doivent être normalisées (même ordre des clés), voir normalize().
 */
import type { BudgetState } from './budget-core.ts'

type WithId = { id: string }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function mergeById<T extends WithId>(base: T[], local: T[], remote: T[]): T[] {
  const B = new Map(base.map(x => [x.id, x]))
  const L = new Map(local.map(x => [x.id, x]))
  const R = new Map(remote.map(x => [x.id, x]))
  const pick = (id: string): T | undefined => {
    const b = B.get(id), l = L.get(id), r = R.get(id)
    if (l && r) return same(l, r) || same(r, b) ? l : same(l, b) ? r : l
    if (l) return b && same(l, b) ? undefined : l // supprimé à distance, inchangé ici
    if (r) return b && same(r, b) ? undefined : r // supprimé ici, inchangé à distance
    return undefined
  }
  const out: T[] = []
  const seen = new Set<string>()
  for (const x of [...local, ...remote]) {
    if (seen.has(x.id)) continue
    seen.add(x.id)
    const v = pick(x.id)
    if (v) out.push(v)
  }
  return out
}

type Plans = BudgetState['plans']
const flatPlans = (p: Plans) => Object.entries(p).flatMap(([mk, m]) => Object.entries(m).map(([cid, v]) => ({ id: `${mk}|${cid}`, v })))
function unflatPlans(items: { id: string, v: number }[]): Plans {
  const out: Plans = {}
  for (const { id, v } of items) {
    const [mk, cid] = id.split('|') as [string, string]
    ;(out[mk] ||= {})[cid] = v
  }
  return out
}

export function mergeStates(base: BudgetState, local: BudgetState, remote: BudgetState): BudgetState {
  return {
    accounts: mergeById(base.accounts, local.accounts, remote.accounts),
    groups: mergeById(base.groups, local.groups, remote.groups),
    categories: mergeById(base.categories, local.categories, remote.categories),
    recurrences: mergeById(base.recurrences, local.recurrences, remote.recurrences),
    plans: unflatPlans(mergeById(flatPlans(base.plans), flatPlans(local.plans), flatPlans(remote.plans))),
    txns: mergeById(base.txns, local.txns, remote.txns),
    demo: local.demo !== base.demo ? local.demo : remote.demo,
  }
}
