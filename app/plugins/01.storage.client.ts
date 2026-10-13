import { watch } from 'vue'
import { emptyState, normalize, regenerateAll, seedDemo, seedStructure } from '~/utils/budget-core'

export const LS_KEY = 'mon-budget-data-v1'
const LS_PREFS = 'mon-budget-prefs-v1'

/* Charge les données du navigateur au démarrage (ou des exemples la première fois),
   prolonge les séries récurrentes, puis enregistre chaque modification. */
export default defineNuxtPlugin(() => {
  const { S, status, replaceState, openGroups } = useBudget()

  let works = true
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t') } catch { works = false }

  let loaded = null
  try { const raw = localStorage.getItem(LS_KEY); if (raw) loaded = normalize(JSON.parse(raw)) } catch { loaded = null }
  if (loaded && (loaded.accounts.length || loaded.groups.length)) replaceState(loaded)
  else { const s = emptyState(); seedStructure(s); seedDemo(s); replaceState(s) }
  regenerateAll(S)

  try { (JSON.parse(localStorage.getItem(LS_PREFS) || '{}').open || []).forEach((k: string) => openGroups.add(k)) } catch { /* préférences absentes */ }

  const save = () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); status.value = 'ok' } catch { status.value = 'error' }
  }
  if (works) save()
  status.value = works ? 'ok' : 'memory'

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(S, () => {
    if (!works) return
    status.value = 'saving'
    clearTimeout(timer)
    timer = setTimeout(() => { timer = undefined; save() }, 400)
  }, { deep: true })
  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); save() } })

  watch(() => [...openGroups], (open) => {
    try { localStorage.setItem(LS_PREFS, JSON.stringify({ open })) } catch { /* ignoré */ }
  })
})
