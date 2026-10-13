import { ref } from 'vue'

const message = ref('')
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

export function useToast() {
  function toast(msg: string) {
    message.value = msg
    visible.value = true
    clearTimeout(timer)
    timer = setTimeout(() => { visible.value = false }, msg.length > 60 ? 6000 : 2600)
  }
  return { message, visible, toast }
}
