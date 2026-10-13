<script setup lang="ts">
import { computed } from 'vue'

const { status } = useBudget()
const { sync } = useSync()
const { open } = useDialogs()

const view = computed(() => {
  if (sync.enabled) {
    return ({
      off: { cls: 'saving', text: 'Synchronisation…' },
      idle: { cls: 'ok', text: 'Synchronisé (chiffré)' },
      syncing: { cls: 'saving', text: 'Synchronisation…' },
      offline: { cls: 'saving', text: 'Hors ligne · modifications en attente' },
      error: { cls: 'error', text: 'Erreur de synchronisation' },
      missing: { cls: 'error', text: 'Budget absent du serveur' },
    })[sync.status]
  }
  return ({
    loading: { cls: 'saving', text: 'Chargement…' },
    ok: { cls: 'ok', text: 'Enregistré dans ce navigateur' },
    saving: { cls: 'saving', text: 'Enregistrement…' },
    error: { cls: 'error', text: "Échec de l'enregistrement" },
    memory: { cls: 'error', text: 'Non enregistré (stockage indisponible)' },
  })[status.value]
})
</script>

<template>
  <button type="button" :class="['store', view.cls]" style="border:0;background:none;padding:0;text-align:left;cursor:pointer" title="Synchronisation entre appareils" @click="open('sync')">
    <i /><span>{{ view.text }}</span>
  </button>
</template>
