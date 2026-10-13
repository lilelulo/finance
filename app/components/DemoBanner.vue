<script setup lang="ts">
const { S } = useBudget()
const { ask } = useChoice()
const { toast } = useToast()

async function clear() {
  const ok = await ask('Effacer les exemples ?', "Les opérations, séries, budgets et wallets d'exemple seront supprimés. Vos comptes et catégories sont conservés (soldes initiaux remis à zéro).", [{ label: 'Effacer et commencer', value: true }])
  if (!ok) return
  S.txns = []; S.recurrences = []; S.plans = {}; S.demo = false
  S.accounts.forEach((a) => { a.initial = 0; a.wallets = [] })
  toast('Exemples effacés')
}
</script>

<template>
  <div v-if="S.demo" class="banner">
    <p><b>Données d'exemple.</b> Les comptes, le budget et les opérations affichés sont fictifs, pour montrer le fonctionnement.</p>
    <button type="button" class="btn sm" @click="clear">Effacer les exemples et commencer</button>
  </div>
</template>
