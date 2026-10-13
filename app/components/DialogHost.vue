<script setup lang="ts">
import { computed } from 'vue'
import AccountEditor from '~/components/dialogs/AccountEditor.vue'
import CategoryEditor from '~/components/dialogs/CategoryEditor.vue'
import DataDialog from '~/components/dialogs/DataDialog.vue'
import GroupEditor from '~/components/dialogs/GroupEditor.vue'
import SyncDialog from '~/components/dialogs/SyncDialog.vue'
import TxnEditor from '~/components/dialogs/TxnEditor.vue'

/* Affiche la fenêtre décrite par ?dialog=… (voir composables/useDialogs.ts). */
const { current, close } = useDialogs()
const d = computed(() => {
  if (!current.value) return null
  const [kind, a, b] = current.value.split(':')
  return { kind, a: a || null, b: b || null, isNew: a === 'new' }
})
</script>

<template>
  <template v-if="d">
    <TxnEditor v-if="d.kind === 'txn'" :key="current!" :txn-id="d.a" @close="close" />
    <AccountEditor v-else-if="d.kind === 'account'" :key="current!" :account-id="d.isNew ? null : d.a"
      :preset-type="d.isNew && d.b === 'savings' ? 'savings' : 'checking'" :focus-wallets="d.b === 'wallets'" @close="close" />
    <GroupEditor v-else-if="d.kind === 'group'" :key="current!" :group-id="d.isNew ? null : d.a"
      :kind="d.b === 'income' ? 'income' : 'expense'" @close="close" />
    <CategoryEditor v-else-if="d.kind === 'cat'" :key="current!" :category-id="d.isNew ? null : d.a"
      :group-id="d.isNew ? d.b : null" @close="close" />
    <DataDialog v-else-if="d.kind === 'data'" @close="close" />
    <SyncDialog v-else-if="d.kind === 'sync'" @close="close" />
  </template>
</template>
