<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/* Synchronisation entre appareils : activation, QR code de liaison, état, déconnexion. */
const emit = defineEmits<{ close: [] }>()
const { sync, enable, join, syncNow, disconnect, deleteRemote, recreate, shareUrl, masterKey, hasWebCrypto } = useSync()
const { confirmDanger, ask } = useChoice()
const { toast } = useToast()

const secure = hasWebCrypto()
const working = ref(false)
const err = ref('')
const showKey = ref(false)
const joinMode = ref(false)
const keyInput = ref('')
const qrSvg = ref('')

const link = computed(() => sync.enabled ? shareUrl() : '')
const statusLabel = computed(() => ({ idle: 'Synchronisé', syncing: 'Synchronisation…', offline: 'Hors ligne', error: 'Erreur', missing: 'Budget absent du serveur', off: '—' })[sync.status])
const last = computed(() => sync.lastSync ? new Date(sync.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais')

// QR code généré dans le navigateur (la clé ne quitte jamais l'appareil).
watch(link, async (url) => {
  qrSvg.value = ''
  if (!url) return
  const QR = (await import('qrcode')).default
  qrSvg.value = await QR.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#13201D', light: '#FFFFFF' } })
}, { immediate: true })

async function run(fn: () => Promise<void>, ok?: string) {
  working.value = true; err.value = ''
  try { await fn(); if (ok) toast(ok) }
  catch (e) { err.value = (e as Error).message }
  finally { working.value = false }
}
const doEnable = () => run(enable, 'Synchronisation activée')
async function doJoin() {
  const raw = keyInput.value.trim()
  const k = /cle=([A-Za-z0-9_-]{43})/.exec(raw)?.[1] ?? raw
  if (!await ask('Lier cet appareil ?', 'Les données actuelles de cet appareil seront remplacées par le budget synchronisé.', [{ label: 'Lier et récupérer', value: true }])) return
  await run(() => join(k), 'Appareil lié : budget récupéré')
}
async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copié`) }
  catch { toast('Copie impossible : sélectionnez le texte et copiez-le.') }
}
async function doDisconnect() {
  if (!await ask('Déconnecter cet appareil ?', "Cet appareil arrête de se synchroniser et oublie la clé. Ses données locales restent. Les autres appareils ne sont pas touchés.", [{ label: 'Déconnecter', value: true }])) return
  disconnect(); toast('Appareil déconnecté')
}
async function doDelete() {
  if (!await confirmDanger('Supprimer le budget du serveur ?', "Le coffre chiffré est supprimé du serveur. Les autres appareils liés ne pourront plus se synchroniser. Les données restent sur cet appareil.", 'Supprimer du serveur')) return
  await run(deleteRemote, 'Budget supprimé du serveur')
}
</script>

<template>
  <AppModal title="Synchronisation entre appareils" @close="emit('close')">
    <div v-if="!secure" class="banner">
      <p><b>Connexion non sécurisée.</b> Le chiffrement du navigateur n'est disponible qu'en <b>HTTPS</b> (ou sur http://localhost). Ouvrez l'application via une adresse https pour utiliser la synchronisation.</p>
    </div>

    <!-- Pas encore activée -->
    <template v-if="!sync.enabled">
      <p>Retrouvez votre budget sur plusieurs appareils. Les données sont <b>chiffrées sur cet appareil</b> avant d'être envoyées : le serveur ne stocke qu'un contenu illisible et ne connaît pas la clé.</p>
      <ul class="muted small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
        <li>Une clé secrète est créée sur cet appareil.</li>
        <li>Pour ajouter un appareil, scannez le QR code affiché ici avec son appareil photo.</li>
        <li>Sans la clé, personne (pas même l'administrateur du serveur) ne peut lire votre budget.</li>
      </ul>
      <template v-if="!joinMode">
        <button type="button" class="btn primary" :disabled="!secure || working" @click="doEnable">Activer la synchronisation</button>
        <button type="button" class="btn ghost" :disabled="!secure" @click="joinMode = true">J'ai déjà un budget synchronisé sur un autre appareil</button>
      </template>
      <template v-else>
        <p class="small">Sur votre autre appareil, ouvrez « Synchronisation » et <b>scannez le QR code</b> avec l'appareil photo de celui-ci. Ou collez ici le lien ou la clé :</p>
        <label class="field"><span>Lien ou clé</span><input v-model="keyInput" data-autofocus autocomplete="off" spellcheck="false" placeholder="https://…/lier#cle=… ou la clé de 43 caractères"></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn primary" :disabled="working || !keyInput.trim()" @click="doJoin">Lier cet appareil</button>
          <button type="button" class="btn ghost" @click="joinMode = false">Retour</button>
        </div>
      </template>
    </template>

    <!-- Activée -->
    <template v-else>
      <div class="wsum">
        <span>
          <b>{{ statusLabel }}</b>
          <span class="muted"> · dernière synchro : {{ last }} · version {{ sync.rev }}</span>
        </span>
        <button type="button" class="btn sm" :disabled="working || sync.status === 'syncing'" @click="run(syncNow)">Synchroniser</button>
      </div>
      <p v-if="sync.error" class="err">{{ sync.error }}</p>

      <div v-if="sync.status === 'missing'" class="banner">
        <p>Le budget chiffré n'existe plus sur le serveur (supprimé depuis un autre appareil ?).</p>
        <button type="button" class="btn sm" :disabled="working" @click="run(recreate, 'Budget renvoyé au serveur')">Le recréer avec les données de cet appareil</button>
      </div>

      <h3 style="font-size:16px">Ajouter un appareil</h3>
      <p class="small">Scannez ce QR code avec l'appareil photo du nouvel appareil, puis ouvrez le lien.</p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="qrSvg" style="width:min(240px,100%);align-self:center;background:#fff;padding:8px;border-radius:12px" v-html="qrSvg" />
      <p class="small warn"><b>Ce QR code donne un accès complet au budget.</b> Ne le montrez qu'à vos propres appareils.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn sm" @click="copy(link, 'Lien')"><AppIcon name="copy" /> Copier le lien</button>
        <button type="button" class="btn sm ghost" @click="showKey = !showKey">{{ showKey ? 'Masquer la clé' : 'Afficher la clé' }}</button>
      </div>
      <p v-if="showKey" class="num small" style="word-break:break-all;user-select:all;background:var(--surface-2);padding:8px 10px;border-radius:8px">{{ masterKey() }}</p>
      <p class="muted small">Si la clé est perdue sur tous vos appareils, les données du serveur sont irrécupérables. Gardez une sauvegarde (.json) ou notez la clé en lieu sûr.</p>
    </template>

    <p v-if="err" class="err">{{ err }}</p>

    <template v-if="sync.enabled" #footer>
      <button type="button" class="btn ghost danger" :disabled="working" @click="doDelete"><AppIcon name="trash" /> Supprimer du serveur</button>
      <span class="sp" />
      <button type="button" class="btn" @click="doDisconnect">Déconnecter cet appareil</button>
    </template>
  </AppModal>
</template>
