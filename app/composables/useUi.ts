import { computed } from 'vue'
import { isMonth, mkey, today } from '~/utils/budget-core'

type QueryPatch = Record<string, string | null | undefined>

/* Mois affiché et filtres, portés par l'URL (?mois=2026-10&compte=…&wallet=…) :
   le bouton retour du navigateur les restaure naturellement. */
export function useUi() {
  const route = useRoute()
  const router = useRouter()
  const q = (k: string) => typeof route.query[k] === 'string' ? route.query[k] as string : undefined

  const month = computed(() => { const m = q('mois'); return isMonth(m) ? m : mkey(today()) })
  const accFilter = computed(() => q('compte') || null)
  /** undefined = pas de filtre ; null = part « non affectée » ; sinon id du wallet. */
  const walletFilter = computed<string | null | undefined>(() => {
    const w = q('wallet')
    return w === undefined ? undefined : w === 'aucun' ? null : w
  })

  function setQuery(patch: QueryPatch, mode: 'replace' | 'push' = 'replace') {
    const query: Record<string, any> = { ...route.query }
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') delete query[k]
      else query[k] = v
    }
    return router[mode]({ query })
  }
  const setMonth = (mk: string) => setQuery({ mois: mk === mkey(today()) ? null : mk })
  /** Lien vers une page en gardant le mois affiché. */
  const link = (path: string, extra: Record<string, string> = {}) =>
    ({ path, query: { ...(q('mois') ? { mois: q('mois') } : {}), ...extra } })

  return { month, accFilter, walletFilter, setQuery, setMonth, link }
}
