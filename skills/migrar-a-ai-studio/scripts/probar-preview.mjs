#!/usr/bin/env node
// Checks the page AI Studio published (…vibepreview.app or the final domain), on
// a phone and on a desktop: it loads with its styles, fonts, images and videos,
// without errors, and its form reaches the CRM. The CRM request is captured and
// ABORTED, so no contact is created: the payload is printed instead.
//
//   cd <workspace>
//   node <skill>/scripts/probar-preview.mjs <url> [--sin-envio]
//        [--abrir "<selector del botón que abre el formulario>"] [--form "<selector>"]
//
// Uses manifiesto.json from the workspace when it is there (expected title, form
// identity, assets); works without it too.
import fs from 'node:fs'
import path from 'node:path'
import { ESPACIO, args, cargar, escribir } from './lib.mjs'

const a = args()
const URL_PAGINA = a._[0]
if (!URL_PAGINA || !/^https?:\/\//.test(URL_PAGINA)) {
  console.error('Uso: node probar-preview.mjs <url publicada, p. ej. https://project-x-….vibepreview.app/>')
  process.exit(1)
}
const M = fs.existsSync(path.join(ESPACIO, 'manifiesto.json')) ? JSON.parse(fs.readFileSync(path.join(ESPACIO, 'manifiesto.json'), 'utf8')) : null
const HOST = new URL(URL_PAGINA).hostname
const resultados = []
function ok(nombre, bien, detalle = '') {
  resultados.push({ nombre, bien: !!bien, detalle })
  console.log(`${bien ? '✓' : '✗'} ${nombre}${detalle ? `\n    ${String(detalle).split('\n').join('\n    ')}` : ''}`)
}
const nota = (m) => console.log(`  · ${m}`)

const { chromium } = await cargar('playwright-core')
const navegador = await chromium.launch({ channel: 'chrome', headless: true })
const vistas = [
  ['teléfono', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['escritorio', { viewport: { width: 1440, height: 900 } }],
]
try {
  for (const [vista, opciones] of vistas) await probar(vista, opciones)
} catch (e) {
  ok('Prueba en Chrome', false, e.message)
} finally {
  await navegador.close()
}
escribir(path.join(ESPACIO, '.validar', 'preview.json'), JSON.stringify({ url: URL_PAGINA, fecha: new Date().toISOString(), resultados }, null, 2))
const malos = resultados.filter((r) => !r.bien)
console.log(`\n${resultados.length - malos.length}/${resultados.length} pruebas bien en ${URL_PAGINA}`)
process.exit(malos.length ? 1 : 0)

async function probar(vista, opciones) {
  console.log(`\n${vista}`)
  const ctx = await navegador.newContext(opciones)
  const p = await ctx.newPage()
  const errores = []
  const fallidos = []
  const envios = []
  const destinos = []
  const medios = new Map()
  p.on('pageerror', (e) => errores.push(String(e.message || e)))
  p.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  p.on('response', (r) => {
    const u = r.url()
    if (/\.(avif|webp|png|jpe?g|gif|svg|mp4|webm|mov)(\?|$)/i.test(u)) medios.set(u, Math.max(medios.get(u) || 0, r.status()))
    else if (r.status() >= 400) fallidos.push(`${r.status()} ${u}`)
  })
  p.on('requestfailed', (r) => {
    if (!/ERR_ABORTED/.test(r.failure()?.errorText || '')) fallidos.push(`${r.failure()?.errorText} ${r.url()}`)
  })
  // the CRM: every POST is captured and aborted (no contact is created)
  await ctx.route(/leadconnectorhq\.com|msgsndr\.com|gohighlevel\.com\/.*(form|survey)/, async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    envios.push({ url: r.request().url(), cuerpo: r.request().postData() || '', tipo: r.request().headers()['content-type'] || '' })
    return r.abort()
  })
  // leaving the site after the form: the navigation is recorded, not followed
  await ctx.route(/^https?:\/\//, (r) => {
    const u = new URL(r.request().url())
    if (r.request().resourceType() === 'document' && u.hostname !== HOST) {
      destinos.push(u.href)
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>destino</title>' })
    }
    return r.fallback()
  })

  const t0 = Date.now()
  await p.goto(URL_PAGINA, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const listo = await p.waitForSelector('html.sc-ready', { timeout: 30000 }).then(() => true).catch(() => false)
  ok('el motor de scroll-craft arrancó', listo, listo ? `${Date.now() - t0} ms` : 'html.sc-ready nunca apareció (¿falta scrollcraft.js o falló la página?)')
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(800)

  const estado = await p.evaluate(() => ({
    titulo: document.title,
    marcador: !!document.querySelector('[data-vibe-blank-page-placeholder]'),
    ...(() => {
      // the engine's rules (data-sc-*, .sc-*) and rules for the page's own classes,
      // whether they arrive in a <style> or a <link>
      const clases = new Set([...document.body.querySelectorAll('[class]')].flatMap((e) => [...e.classList]).filter((c) => !/^sc-/.test(c)))
      let hojaMotor = false
      let estilosPagina = false
      const recorrer = (reglas) => {
        for (const r of reglas) {
          if (r.cssRules) recorrer(r.cssRules)
          const sel = r.selectorText || ''
          if (/data-sc-|\.sc-/.test(sel)) hojaMotor = true
          if (!estilosPagina) for (const m of sel.matchAll(/\.([\w-]+)/g)) if (clases.has(m[1])) estilosPagina = true
        }
      }
      for (const h of document.styleSheets) {
        try {
          recorrer(h.cssRules)
        } catch {}
      }
      return { hojaMotor, estilosPagina }
    })(),
    fuentes: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))].sort(),
    fondo: getComputedStyle(document.body).backgroundColor,
  }))
  ok('es la página migrada (no la plantilla en blanco)', !estado.marcador && (!M?.meta?.titulo || estado.titulo === M.meta.titulo), `título: ${estado.titulo}`)
  ok('llegaron los estilos del motor y de la página', estado.hojaMotor && estado.estilosPagina, `fondo ${estado.fondo}`)
  ok('fuentes cargadas', estado.fuentes.length > 0 || !M, estado.fuentes.join(', ') || 'solo fuentes del sistema')

  // walk the page so every lazy image, video and act is exercised
  const alto = await p.evaluate(() => document.documentElement.scrollHeight)
  const vh = opciones.viewport.height
  const vacios = []
  for (let y = 0; y <= alto; y += Math.round(vh * 0.25)) {
    await p.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y)
    await p.waitForTimeout(110)
    if (vista === 'teléfono' && y % Math.round(vh * 0.5) < Math.round(vh * 0.25)) vacios.push({ y, hueco: await huecoMayor(p) })
  }
  await p.waitForTimeout(800)
  // lazy images off screen may not have started: load them all, then look
  await p.evaluate(async () => {
    const imgs = [...document.images].filter((i) => i.getClientRects().length)
    for (const i of imgs) i.loading = 'eager'
    await Promise.race([Promise.allSettled(imgs.map((i) => i.decode())), new Promise((r) => setTimeout(r, 10000))])
  })
  const imagenes = await p.evaluate(() => [...document.images].filter((i) => i.getClientRects().length).map((i) => ({ src: i.currentSrc || i.src, bien: i.complete && i.naturalWidth > 0 })))
  const rotas = imagenes.filter((i) => !i.bien)
  ok(`las ${imagenes.length} imágenes visibles cargan`, rotas.length === 0, rotas.map((i) => i.src).join('\n'))
  const sinUrl = [...medios.keys()].filter((u) => new URL(u).hostname === HOST && /\/assets\//.test(u))
  ok('cada asset tiene su URL de AI Studio (ninguno cae a /assets/)', sinUrl.length === 0, sinUrl.map((u) => new URL(u).pathname).join(', '))
  const mediosMal = [...medios].filter(([, s]) => s >= 400)
  ok(`imágenes y videos responden bien (${medios.size})`, mediosMal.length === 0, mediosMal.map(([u, s]) => `${s} ${u}`).join('\n'))
  const desborde = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok('sin scroll horizontal', desborde <= 0, desborde > 0 ? `${desborde}px` : '')
  if (vacios.length) {
    const peores = vacios.filter((v) => v.hueco > 0.45 * vh).map((v) => `y=${v.y}: ${Math.round((v.hueco / vh) * 100)}% de la pantalla vacía`)
    if (peores.length) nota(`Para revisar en el teléfono (puede ser un silencio intencional): ${peores.slice(0, 6).join(' · ')}`)
  }

  if (!a['sin-envio']) await enviar(p, vista, envios, destinos)
  ok('sin errores en la consola', errores.length === 0, errores.slice(0, 6).join('\n'))
  ok('sin peticiones fallidas', fallidos.length === 0, fallidos.slice(0, 8).join('\n'))
  await ctx.close()
}

async function enviar(p, vista, envios, destinos) {
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await p.waitForTimeout(400)
  const abrir = typeof a.abrir === 'string' ? a.abrir : M?.formulario?.abrir
  if (abrir) {
    const boton = p.locator(abrir).first()
    await (vista === 'teléfono' ? boton.tap() : boton.click())
    await p.waitForTimeout(700)
  }
  const selector = typeof a.form === 'string' ? a.form : M?.formulario?.selector || 'form[data-ai-studio-form]'
  const hay = await p.locator(selector).count()
  if (!hay) {
    if (M?.formulario?.existe || a.form) ok('el formulario está en la página', false, `no encontré ${selector}`)
    return
  }
  const antes = p.url()
  // typed like a person would (React-controlled inputs ignore values set from outside)
  const info = await p.evaluate((sel) => {
    const f = document.querySelector(sel)
    const destino = f.dataset.destino || (/^https?:\/\//.test(f.getAttribute('action') || '') ? f.getAttribute('action') : '')
    const campos = [...f.querySelectorAll('input[name], select[name], textarea[name]')].map((el) => ({ name: el.name, tipo: (el.getAttribute('type') || el.tagName).toLowerCase(), tag: el.tagName }))
    return { destino, campos, nombres: [...new Set(campos.map((c) => c.name))] }
  }, selector)
  const valores = { email: 'prueba.preview@example.com', tel: '5512345678', number: '1', url: 'https://example.com', date: '2026-10-01' }
  for (const c of info.campos) {
    if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(c.tipo)) continue
    const campo = p.locator(`${selector} [name="${c.name}"]`).first()
    if (!(await campo.isVisible().catch(() => false))) continue
    if (c.tipo === 'checkbox' || c.tipo === 'radio') await campo.check().catch(() => {})
    else if (c.tag === 'SELECT') {
      const v = await campo.evaluate((el) => [...el.options].find((o) => o.value)?.value)
      if (v) await campo.selectOption(v)
    } else await campo.fill(valores[c.tipo] || (/mail|correo/i.test(c.name) ? valores.email : 'Prueba Preview'))
  }
  const boton = p.locator(`${selector} [type=submit]`).first()
  const t0 = Date.now()
  if (await boton.isVisible().catch(() => false)) await (vista === 'teléfono' ? boton.tap() : boton.click())
  else await p.evaluate((sel) => document.querySelector(sel).requestSubmit(), selector)
  // read GTM's layer now: the page waits at least 1 s before it leaves
  const lead = await p.evaluate(() => (window.dataLayer || []).find((e) => e && e.event === 'lead') || null).catch(() => null)
  await p.waitForURL((u) => u.href !== antes, { timeout: 6000 }).catch(() => {})
  await p.waitForTimeout(300)

  const eventos = envios.map(leerEvento).filter((e) => e && (e.formId || /form/i.test(e.type || '')))
  const ev = eventos[0]
  ok('el envío llega al CRM (interceptado: no se creó ningún contacto)', !!ev, ev ? '' : envios.length ? `${envios.length} POST sin formulario: ${envios.map((x) => x.url).join(', ')}` : 'ninguna petición al CRM. ¿Se conectó el formulario y se volvió a publicar?')
  if (ev) {
    console.log(`    ${JSON.stringify({ type: ev.type, formId: ev.formId, mediumId: ev.mediumId, formData: ev.formData, trackingId: ev.trackingId, locationId: ev.locationId, path: ev.path })}`)
    if (M?.formulario?.formId) ok('con el formId del kit', ev.formId === M.formulario.formId, `${ev.formId} (esperado ${M.formulario.formId})`)
    if (M?.formulario?.mediumId && ev.mediumId !== undefined) ok('con el medio del kit', ev.mediumId === M.formulario.mediumId, String(ev.mediumId))
    const datos = JSON.stringify(ev.formData || ev)
    const faltan = info.nombres.filter((n) => !datos.includes(n) && !(n === 'email' && datos.includes('prueba.preview@example.com')))
    if (faltan.length) nota(`Campos del formulario que no vi en el envío: ${faltan.join(', ')} (revisa cómo los nombra AI Studio)`)
  }
  if (lead || M?.gtm) ok('evento «lead» para GTM', !!lead && (!M?.formulario?.formId || lead.formId === M.formulario.formId), lead ? `formId: ${lead.formId}` : '')
  if (info.destino) {
    const llego = destinos.includes(info.destino) || p.url() === info.destino
    ok('después del envío va a su destino, en la misma pestaña', llego, `${Date.now() - t0} ms · ${destinos[0] || p.url()}`)
  } else if (destinos.length) nota(`Después del envío fue a ${destinos[0]} (${Date.now() - t0} ms)`)
}

function leerEvento(x) {
  try {
    if (/json/.test(x.tipo)) {
      const j = JSON.parse(x.cuerpo)
      return j.event || j
    }
    const m = x.cuerpo.match(/name="event"\r?\n\r?\n([\s\S]*?)\r?\n--/)
    return m ? JSON.parse(m[1]) : null
  } catch {
    return null
  }
}

// the tallest band of the screen with nothing to see (fixed bars do not count)
async function huecoMayor(p) {
  return p.evaluate(() => {
    const vh = innerHeight
    const visible = (el) => {
      let o = 1
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') return false
        o *= parseFloat(cs.opacity)
        if (o < 0.15) return false
      }
      return true
    }
    const tramos = []
    const agregar = (r) => {
      const t = Math.max(r.top, 0)
      const b = Math.min(r.bottom, vh)
      if (b - t > 2 && r.width > 2) tramos.push([t, b])
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const rango = document.createRange()
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName) || !visible(n.parentElement)) continue
      rango.selectNodeContents(n)
      for (const r of rango.getClientRects()) agregar(r)
    }
    for (const el of document.querySelectorAll('img, video, canvas, svg, picture, iframe, input, button, textarea, select')) if (visible(el)) agregar(el.getBoundingClientRect())
    tramos.sort((x, y) => x[0] - y[0])
    let hueco = 0
    let cursor = 0
    for (const [t, b] of tramos) {
      hueco = Math.max(hueco, t - cursor)
      cursor = Math.max(cursor, b)
    }
    return Math.max(hueco, vh - cursor)
  })
}
