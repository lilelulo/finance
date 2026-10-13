// Résolution des imports de l'app hors Nuxt : 'vue' → bouchon, '~/…' → app/…
const APP = new URL('../../app/', import.meta.url).href
export async function resolve(spec, ctx, next) {
  if (spec === 'vue') return { url: new URL('./vue-stub.mjs', import.meta.url).href, shortCircuit: true }
  if (spec.startsWith('~/')) {
    let p = spec.slice(2)
    if (!p.endsWith('.ts')) p += '.ts'
    return next(APP + p, ctx)
  }
  if (spec.startsWith('./') && ctx.parentURL?.startsWith(APP) && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
  return next(spec, ctx)
}
