import { watch } from 'vue'

/* Démarre la synchronisation chiffrée (si cet appareil est lié) et
   envoie les modifications au serveur peu après chaque changement. */
export default defineNuxtPlugin(() => {
  const { S } = useBudget()
  const sync = useSync()
  void sync.start(String(useRuntimeConfig().public.syncUrl || ''))
  watch(S, () => sync.schedule(), { deep: true })
})
