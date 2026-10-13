<script setup lang="ts">
/* « Compte » ou « Compte  Wallet » pour un côté d'une opération. */
const props = defineProps<{ accountId: string | null, walletId: string | null }>()
const { acc, hasWallets, walletOf } = useBudget()
</script>

<template>
  <span>{{ acc(props.accountId)?.name ?? '?' }}<template v-if="hasWallets(props.accountId)"> <span class="wtag">{{ walletOf(props.accountId, props.walletId)?.name ?? 'Non affecté' }}</span></template></span>
</template>
