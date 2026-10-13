<script setup lang="ts">
import { ref } from 'vue'
import { emptyState, normalize, regenerateAll, seedStructure, today } from '~/utils/budget-core'

/* Export / import d'une sauvegarde .json, remise à zéro. */
const emit = defineEmits<{ close: [] }>()
const B = useBudget()
const { sync } = useSync()
const { open } = useDialogs()
const { confirmDanger } = useChoice()
const { toast } = useToast()
const file = ref<HTMLInputElement>()
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`

function exportData() {
  const data = JSON.stringify({ app: 'mon-budget', version: 1, exportedAt: new Date().toISOString(), ...B.S }, null, 2)
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `mon-budget-${today()}.json` })
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast('Sauvegarde exportée')
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  let data
  try { data = normalize(JSON.parse(await f.text())) }
  catch { toast("Ce fichier n'est pas une sauvegarde valide."); return }
  if (!data.accounts.length && !data.txns.length && !data.groups.length) { toast('Ce fichier ne contient aucune donnée de budget.'); return }
  if (!await confirmDanger('Importer cette sauvegarde ?', `${plural(data.accounts.length, 'compte')}, ${plural(data.txns.length, 'opération')}. Les données actuelles seront remplacées.`, 'Importer')) return
  B.replaceState(data)
  regenerateAll(B.S)
  toast('Sauvegarde importée')
  emit('close')
}

async function reset() {
  if (!await confirmDanger('Tout effacer ?', 'Toutes les opérations, budgets, comptes et catégories seront supprimés. Exportez une sauvegarde avant si besoin.', 'Tout effacer')) return
  const s = emptyState()
  seedStructure(s)
  B.replaceState(s)
  toast('Données effacées')
  emit('close')
}
</script>

<template>
  <AppModal title="Sauvegarde & données" narrow @close="emit('close')">
    <p v-if="sync.enabled">Vos données sont enregistrées dans ce navigateur et synchronisées, chiffrées, avec vos autres appareils.</p>
    <p v-else>Vos données sont enregistrées dans ce navigateur uniquement. Activez la synchronisation chiffrée pour les retrouver sur vos autres appareils, ou exportez régulièrement une sauvegarde.</p>
    <p class="muted small">{{ plural(B.S.accounts.length, 'compte') }} · {{ plural(B.S.txns.length, 'opération') }} · {{ plural(B.S.recurrences.length, 'série') }} récurrente{{ B.S.recurrences.length > 1 ? 's' : '' }}</p>
    <div class="data-actions">
      <button type="button" class="opt" @click="open('sync')">Synchronisation entre appareils<small>{{ sync.enabled ? 'Activée · ajouter un appareil par QR code' : 'Chiffrée de bout en bout, liaison par QR code' }}</small></button>
      <button type="button" class="opt" @click="exportData">Exporter une sauvegarde<small>Fichier .json contenant toutes vos données</small></button>
      <button type="button" class="opt" @click="file?.click()">Importer une sauvegarde<small>Remplace les données actuelles par celles du fichier (compatible avec la version HTML)</small></button>
      <button type="button" class="opt danger" @click="reset">Repartir de zéro<small>Efface tout et recrée les comptes et catégories de départ</small></button>
    </div>
    <input ref="file" type="file" accept="application/json,.json" hidden @change="onFile">
  </AppModal>
</template>
