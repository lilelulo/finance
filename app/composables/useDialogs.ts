import { computed, ref } from 'vue'

/* Fenêtres d'édition portées par l'URL (?dialog=txn:ID, account:new:savings…) :
   le bouton retour du navigateur ferme la fenêtre ouverte.
   Formats : txn | txn:<id> | account:new:<checking|savings> | account:<id>[:wallets]
             group:new:<expense|income> | group:<id> | cat:new:<groupId> | cat:<id> | data | sync */
const openedHere = ref(false)

export function useDialogs() {
  const route = useRoute()
  const router = useRouter()
  const current = computed(() => typeof route.query.dialog === 'string' ? route.query.dialog : null)

  function open(dialog: string) {
    openedHere.value = true
    return router.push({ query: { ...route.query, dialog } })
  }
  function close() {
    if (!current.value) return
    if (openedHere.value && window.history.state?.back) {
      openedHere.value = false
      return router.back()
    }
    const query = { ...route.query }
    delete query.dialog
    return router.replace({ query })
  }
  return { current, open, close }
}
