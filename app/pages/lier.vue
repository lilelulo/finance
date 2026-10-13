<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { isValidMasterKey } from '~/utils/sync-crypto'

/* Ouverte depuis le QR code : /lier#cle=…  (la partie après # n'est jamais envoyée au serveur). */
definePageMeta({ title: 'Lier cet appareil', noMonth: true })

const router = useRouter()
const { sync, join, masterKey, hasWebCrypto } = useSync()
const { toast } = useToast()
const key = ref<string | null>(null)
const working = ref(false)
const err = ref('')
const secure = hasWebCrypto()

onMounted(() => {
  const k = /cle=([A-Za-z0-9_-]{43})/.exec(window.location.hash)?.[1] ?? null
  key.value = k && isValidMasterKey(k) ? k : null
  // On retire aussitôt la clé de l'adresse (et de l'historique).
  if (window.location.hash) void router.replace({ path: '/lier', hash: '' })
})

async function confirm() {
  if (!key.value) return
  working.value = true; err.value = ''
  try {
    await join(key.value)
    toast('Appareil lié : budget récupéré')
    await router.replace('/')
  }
  catch (e) { err.value = (e as Error).message }
  finally { working.value = false }
}
</script>

<template>
  <div class="panel" style="padding:20px;display:flex;flex-direction:column;gap:14px;max-width:560px">
    <template v-if="!secure">
      <p><b>Connexion non sécurisée.</b> Le chiffrement n'est possible qu'en HTTPS. Ouvrez ce lien via une adresse https.</p>
    </template>
    <template v-else-if="!key">
      <p>Ce lien ne contient pas de clé valide. Sur l'appareil déjà synchronisé, ouvrez « Synchronisation » et scannez de nouveau le QR code.</p>
      <NuxtLink class="btn" to="/">Retour à l'accueil</NuxtLink>
    </template>
    <template v-else-if="sync.enabled && masterKey() === key">
      <p>Cet appareil est déjà lié à ce budget.</p>
      <NuxtLink class="btn primary" to="/">Ouvrir le budget</NuxtLink>
    </template>
    <template v-else>
      <h2 style="font-size:19px">Récupérer le budget synchronisé</h2>
      <p>Cet appareil va télécharger le budget chiffré et le déchiffrer avec la clé contenue dans le QR code. Il restera ensuite synchronisé.</p>
      <p class="small warn"><b>Les données actuellement présentes sur cet appareil seront remplacées.</b><template v-if="sync.enabled"> Cet appareil est aussi déconnecté de son budget synchronisé actuel.</template></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn primary" :disabled="working" @click="confirm">{{ working ? 'Récupération…' : 'Lier cet appareil' }}</button>
        <NuxtLink class="btn ghost" to="/">Annuler</NuxtLink>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
    </template>
  </div>
</template>
