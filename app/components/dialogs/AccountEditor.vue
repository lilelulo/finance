<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { amountText, money, parseAmount, round2, uid } from '~/utils/budget-core'
import type { AccountType, Wallet } from '~/utils/budget-core'

/* Création / modification d'un compte, avec ses wallets s'il s'agit d'un compte d'épargne. */
const props = defineProps<{ accountId: string | null, presetType: AccountType, focusWallets?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const B = useBudget()
const { confirmDanger } = useChoice()
const { toast } = useToast()

const a = props.accountId ? B.acc(props.accountId) : undefined
const form = reactive({
  type: (a?.type || props.presetType) as AccountType,
  name: a?.name || '',
  initial: a ? amountText(a.initial) : '',
  wallets: (a?.wallets || []).map(w => ({ id: w.id, name: w.name, initial: amountText(w.initial), goal: amountText(w.goal), sure: false })),
})
const err = ref('')
const box = ref<HTMLElement>()

onMounted(async () => {
  if (props.accountId && !a) { emit('close'); return }
  if (props.focusWallets && form.type === 'savings') {
    if (!form.wallets.length) addWallet()
    await nextTick()
    box.value?.querySelector<HTMLInputElement>('[data-wname]')?.focus()
  }
})

const used = (wid: string) => B.S.txns.some(t => t.walletId === wid || t.toWalletId === wid)
  || B.S.recurrences.some(r => r.walletId === wid || r.toWalletId === wid)
const unassigned = computed(() => (parseAmount(form.initial) || 0) - form.wallets.reduce((s, w) => s + (parseAmount(w.initial) || 0), 0))

async function addWallet() {
  form.wallets.push({ id: uid(), name: '', initial: '', goal: '', sure: false })
  await nextTick()
  const ins = box.value?.querySelectorAll<HTMLInputElement>('[data-wname]')
  ins?.[ins.length - 1]?.focus()
}
function removeWallet(i: number) {
  const w = form.wallets[i]!
  if (used(w.id) && !w.sure) {
    err.value = `« ${w.name || 'Ce wallet'} » est utilisé par des opérations : elles passeront en « Non affecté ». Cliquez à nouveau sur la corbeille pour confirmer.`
    w.sure = true
    return
  }
  form.wallets.splice(i, 1)
  err.value = ''
}

function submit() {
  err.value = ''
  const name = form.name.trim()
  const init = form.initial.trim() ? parseAmount(form.initial) : 0
  if (!name) return (err.value = 'Donnez un nom au compte.')
  if (init === null) return (err.value = "Le solde initial n'est pas un montant valide.")
  const wallets: Wallet[] = []
  if (form.type === 'savings') {
    for (const w of form.wallets) {
      const wi = w.initial.trim() ? parseAmount(w.initial) : 0
      const wg = w.goal.trim() ? parseAmount(w.goal) : 0
      if (!w.name.trim()) return (err.value = 'Chaque wallet doit avoir un nom.')
      if (wi === null || wg === null || wg < 0) return (err.value = `Montant invalide pour le wallet « ${w.name} ».`)
      wallets.push({ id: w.id, name: w.name.trim(), initial: round2(wi), goal: round2(wg) })
    }
  }
  const S = B.S
  const keep = new Set(wallets.map(w => w.id))
  let id = a?.id
  if (a) Object.assign(a, { name, type: form.type, initial: round2(init), wallets })
  else { id = uid(); S.accounts.push({ id, name, type: form.type, initial: round2(init), wallets }) }
  // Les opérations d'un wallet supprimé passent en « Non affecté ».
  for (const x of [...S.txns, ...S.recurrences]) {
    if (x.accountId === id && x.walletId && !keep.has(x.walletId)) x.walletId = null
    if (x.toAccountId === id && x.toWalletId && !keep.has(x.toWalletId)) x.toWalletId = null
  }
  toast(a ? 'Compte modifié' : 'Compte ajouté')
  emit('close')
}

async function remove() {
  if (!a) return
  const S = B.S
  if (S.txns.some(t => t.accountId === a.id || t.toAccountId === a.id) || S.recurrences.some(r => r.accountId === a.id || r.toAccountId === a.id)) {
    err.value = 'Ce compte a des opérations. Supprimez-les ou changez leur compte avant de le supprimer.'
    return
  }
  if (!await confirmDanger('Supprimer ce compte ?', `« ${a.name} » sera supprimé.`)) return
  S.accounts = S.accounts.filter(x => x.id !== a.id)
  toast('Compte supprimé')
  emit('close')
}
</script>

<template>
  <AppModal :title="a ? 'Modifier le compte' : 'Nouveau compte'" @close="emit('close')">
    <form id="f-acc" class="form" novalidate @submit.prevent="submit">
      <div class="seg" role="radiogroup" aria-label="Type de compte">
        <button type="button" role="radio" :aria-checked="form.type === 'checking'" :class="['seg-btn', { on: form.type === 'checking' }]" @click="form.type = 'checking'"><AppIcon name="bank" /> Compte courant</button>
        <button type="button" role="radio" :aria-checked="form.type === 'savings'" :class="['seg-btn', { on: form.type === 'savings' }]" @click="form.type = 'savings'"><AppIcon name="db" /> Compte épargne</button>
      </div>
      <label class="field"><span>Nom du compte</span><input v-model="form.name" :data-autofocus="!focusWallets || undefined" autocomplete="off" placeholder="ex. Compte joint, Livret A"></label>
      <label class="field"><span>Solde initial</span>
        <span class="amount-in"><input v-model="form.initial" inputmode="decimal" autocomplete="off" placeholder="0"><span>€</span></span>
        <small>Solde du compte avant la première opération saisie. Peut être négatif.</small>
      </label>
      <div ref="box">
        <p v-if="form.type !== 'savings' && form.wallets.length" class="small warn">Les {{ form.wallets.length }} wallets de ce compte seront supprimés à l'enregistrement.</p>
        <div v-if="form.type === 'savings'" class="wedit">
          <div class="sec-head"><h3 style="font-size:16px">Wallets</h3><span class="muted small">Répartissez l'argent du compte par objectif</span></div>
          <div v-for="(w, i) in form.wallets" :key="w.id" class="wedit-row">
            <label class="field"><span>Nom</span><input v-model="w.name" data-wname placeholder="ex. Taxe foncière" autocomplete="off"></label>
            <label class="field"><span>Montant initial</span><input v-model="w.initial" inputmode="decimal" placeholder="0" autocomplete="off"></label>
            <label class="field"><span>Objectif <em>facultatif</em></span><input v-model="w.goal" inputmode="decimal" placeholder="—" autocomplete="off"></label>
            <button type="button" class="iconbtn" :aria-label="`Supprimer le wallet ${w.name}`" @click="removeWallet(i)"><AppIcon name="trash" /></button>
          </div>
          <button type="button" class="btn sm" style="align-self:flex-start" @click="addWallet"><AppIcon name="plus" /> Ajouter un wallet</button>
          <div class="wsum"><span>Non affecté au départ</span><span :class="['num', { neg: unassigned < 0 }]">{{ money(unassigned) }}</span></div>
          <p class="muted small">Le solde global du compte = somme des wallets + part non affectée. Lors d'un virement vers ou depuis ce compte, vous choisirez le wallet concerné.</p>
        </div>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
    </form>
    <template #footer>
      <button v-if="a" type="button" class="btn ghost danger" @click="remove"><AppIcon name="trash" /> Supprimer</button>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Annuler</button>
      <button type="submit" class="btn primary" form="f-acc">Enregistrer</button>
    </template>
  </AppModal>
</template>
