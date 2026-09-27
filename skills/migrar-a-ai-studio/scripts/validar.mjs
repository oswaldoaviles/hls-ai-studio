#!/usr/bin/env node
// Proves the converted site on the student's OWN AI Studio template, before any
// message goes to the chat: the blank project from their ZIP plus the files,
// then install, build, strict TypeScript and Prettier as AI Studio has them, and
// the page in Chrome next to the original.
//
//   cd <workspace>
//   node <skill>/scripts/validar.mjs [--puerto 4810] [--instalar] [--shoot]
//
// Works in <workspace>/.validar/proyecto (kept between runs: node_modules is
// installed once, again only when the template's package.json changes).
// Nothing leaves the machine: the form's CRM call is replaced by a recorder,
// every request to another site is blocked, and the form's destination is stubbed.
//
// Leaves in .validar/: informe.json, and comparacion-<viewport>.jpg (the original
// and the AI Studio page at the same scroll positions, side by side). Look at them.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { ESPACIO, abrirZip, args, cargar, escribir, formatear, leer, prettierDe, sha } from './lib.mjs'

const a = args()
const MANIFIESTO = path.join(ESPACIO, 'manifiesto.json')
if (!fs.existsSync(MANIFIESTO)) {
  console.error(`No encuentro ${MANIFIESTO}. Corre primero convertir-html.mjs.`)
  process.exit(1)
}
const M = JSON.parse(leer(MANIFIESTO))
const ARCHIVOS = path.join(ESPACIO, 'archivos')
const RAIZ = path.join(ESPACIO, '.validar')
const PROY = path.join(RAIZ, 'proyecto')
const PUERTO = Number(a.puerto || 4810)
const costura = M.formulario?.costura || 'src/components/pagina/lead.ts'

const resultados = []
function ok(nombre, bien, detalle = '') {
  resultados.push({ nombre, bien: !!bien, detalle })
  console.log(`${bien ? '✓' : '✗'} ${nombre}${detalle ? `\n    ${String(detalle).split('\n').join('\n    ')}` : ''}`)
}
const nota = (m) => console.log(`  · ${m}`)
const cola = (t, n = 25) => String(t || '').trim().split('\n').slice(-n).join('\n')

// ---- 1. the template, fresh, with the files ------------------------------------------
const zip = await abrirZip(M.plantilla)
const pkg = zip.leer('package.json')
if (!pkg) throw new Error(`${M.plantilla} no parece un proyecto de AI Studio (no trae package.json)`)
const marca = path.join(RAIZ, 'package.sha')
const reusar = !a.instalar && fs.existsSync(path.join(PROY, 'node_modules')) && fs.existsSync(marca) && leer(marca) === sha(pkg)
fs.mkdirSync(PROY, { recursive: true })
for (const e of fs.readdirSync(PROY)) if (!(reusar && e === 'node_modules')) fs.rmSync(path.join(PROY, e), { recursive: true, force: true })
zip.extraer(PROY)

const config = prettierDe(zip)
const nuestros = []
for (const x of M.archivos) {
  let t = leer(path.join(ARCHIVOS, x.ruta))
  if (/\.tsx?$/.test(x.ruta)) t = await formatear(x.ruta, t, config)
  escribir(path.join(PROY, x.ruta), t)
  nuestros.push(x.ruta)
}

// the form's seam records each call (AI Studio replaces this file when it connects)
const archivoCostura = path.join(PROY, costura)
let grabadora = false
if (fs.existsSync(archivoCostura)) {
  const t = leer(archivoCostura)
  const firma = /export\s+(async\s+)?function\s+sendLeadToCrm\b/
  if (firma.test(t)) {
    escribir(
      archivoCostura,
      t.replace(firma, (_m, asy) => `${asy || ''}function sendLeadToCrmOriginal`) +
        `
// validar.mjs: records each submission (window.__leads) instead of sending it
export function sendLeadToCrm(
  ...args: Parameters<typeof sendLeadToCrmOriginal>
): ReturnType<typeof sendLeadToCrmOriginal> {
  const w = window as unknown as { __leads?: unknown[] };
  const lista: unknown[] = args;
  (w.__leads ??= []).push(lista.length === 1 ? lista[0] : lista);
  return sendLeadToCrmOriginal(...args);
}
`,
    )
    grabadora = true
  }
}

// the files to upload get a URL, as the chat will give them one: here, local ones
const mapaImagenes = path.join(PROY, M.mapaImagenes || 'src/components/pagina/image-urls.ts')
const porRuta = new Map() // /_kit/<file> -> key
if ((M.imagenes || []).length && fs.existsSync(mapaImagenes)) {
  let t = leer(mapaImagenes)
  for (const i of M.imagenes) {
    const nombre = path.basename(i.archivo)
    const destino = path.join(PROY, 'public', '_kit', nombre)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.copyFileSync(i.archivo, destino)
    porRuta.set(`/_kit/${nombre}`, i.clave)
    const k = i.clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const antes = t
    t = t.replace(new RegExp(`((["'])${k}\\2|(?<![\\w$-])${k}(?![\\w$-]))(\\s*:\\s*)(["'])\\4`), `$1$3"/_kit/${nombre}"`)
    if (t === antes) nota(`No encontré la clave «${i.clave}» vacía en ${M.mapaImagenes || 'image-urls.ts'}`)
  }
  escribir(mapaImagenes, t)
}
console.log(`Proyecto de prueba: ${PROY}\n  plantilla de ${path.basename(M.plantilla)} + ${nuestros.length} archivos + ${(M.imagenes || []).length} assets\n`)

// ---- 2. install, build, types, format --------------------------------------------------
if (!reusar) {
  console.log('Instalando las dependencias de la plantilla (1-3 minutos la primera vez)…')
  const r = spawnSync('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: PROY, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    ok('npm install de la plantilla', false, 'Revisa el error de arriba.')
    process.exit(1)
  }
  fs.writeFileSync(marca, sha(pkg))
}
const bin = (n) => path.join(PROY, 'node_modules', '.bin', process.platform === 'win32' ? `${n}.cmd` : n)
const correr = (cmd, argv) => spawnSync(bin(cmd), argv, { cwd: PROY, encoding: 'utf8', maxBuffer: 64 << 20, shell: process.platform === 'win32' })

const build = correr('vite', ['build'])
ok('Compila con la configuración de AI Studio (vite build)', build.status === 0, build.status === 0 ? '' : cola(build.stdout + build.stderr))

const tsc = correr('tsc', ['--noEmit', '-p', 'tsconfig.json'])
const errores = String(tsc.stdout || '').split('\n').filter((l) => /error TS\d+/.test(l))
const propios = errores.filter((l) => nuestros.some((r) => l.startsWith(r)))
ok('TypeScript estricto de la plantilla, sin errores en los archivos del kit', propios.length === 0, propios.slice(0, 12).join('\n'))
if (errores.length > propios.length) nota(`${errores.length - propios.length} error(es) de TypeScript en archivos de la plantilla: ${errores.filter((l) => !propios.includes(l)).slice(0, 3).join(' | ')}`)

const revisar = nuestros.filter((r) => /\.tsx?$/.test(r) && r !== costura)
const pc = correr('prettier', ['--check', ...revisar])
ok('El Prettier de la plantilla no cambiaría ningún archivo (el conteo de líneas es estable)', pc.status === 0, pc.status === 0 ? '' : cola(pc.stdout + pc.stderr, 12))

// ---- 3. the page in Chrome, next to the original -------------------------------------
const dev = spawn(bin('vite'), ['dev', '--port', String(PUERTO), '--strictPort'], { cwd: PROY, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
let logDev = ''
dev.stdout.on('data', (d) => (logDev += d))
dev.stderr.on('data', (d) => (logDev += d))
const htmlOriginal = M.origen?.html
const servidorOriginal = htmlOriginal && fs.existsSync(htmlOriginal) ? await servir(path.dirname(htmlOriginal), PUERTO + 1) : null
const URL_AI = `http://localhost:${PUERTO}/`
const URL_ORIGINAL = servidorOriginal && `http://localhost:${PUERTO + 1}/${path.basename(htmlOriginal)}`

let navegador
try {
  if (!(await esperarHttp(URL_AI, 120000))) throw new Error(`vite dev no respondió en ${URL_AI}\n${cola(logDev)}`)
  const ssr = await (await fetch(URL_AI)).text()
  ok('La página llega armada desde el servidor (buscadores y primera carga)', /data-sc-act/.test(ssr) && ssr.includes(`<title>${escaparHtml(M.meta?.titulo || '')}</title>`), `${(ssr.length / 1024).toFixed(0)} KB de HTML`)
  const veces = ssr.split('all: revert-layer').length - 1
  if (veces) ok('Los estilos de la página van una sola vez en el HTML', veces === 1, `${veces} veces`)
  const { chromium } = await cargar('playwright-core')
  navegador = await chromium.launch({ channel: 'chrome', headless: true })
  const vistas = [
    ['escritorio', { viewport: { width: 1440, height: 900 } }],
    ['telefono', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]
  const pedidos = new Map() // asset -> worst status seen
  for (const [vista, opciones] of vistas) {
    await funcional(vista, opciones, pedidos)
    if (URL_ORIGINAL) await comparar(vista, opciones)
  }
  const assetsFallidos = [...pedidos].filter(([, s]) => s >= 400)
  ok('Cada archivo de assets/ que pidió la página respondió bien', assetsFallidos.length === 0, assetsFallidos.map(([k, s]) => `${k} (${s})`).join(', '))
  const nunca = (M.imagenes || []).map((i) => i.clave).filter((k) => !pedidos.has(k))
  if (nunca.length) nota(`Nunca se pidieron (normal para og:image o archivos de una sola vista): ${nunca.join(', ')}`)
} catch (e) {
  ok('Prueba en Chrome', false, e.message)
} finally {
  await navegador?.close()
  servidorOriginal?.close()
  try {
    if (process.platform === 'win32') dev.kill()
    else process.kill(-dev.pid, 'SIGTERM')
  } catch {}
}

// optional: scroll-craft's own harness on the migrated page (dead scroll, contrast)
if (a.shoot) {
  const shoot = buscarShoot()
  if (!shoot) nota('No encontré scroll-craft (scripts/shoot.mjs): omito --shoot.')
  else {
    const dev2 = spawn(bin('vite'), ['dev', '--port', String(PUERTO), '--strictPort'], { cwd: PROY, stdio: 'ignore', detached: process.platform !== 'win32' })
    try {
      await esperarHttp(URL_AI, 120000)
      for (const [dir, extra] of [['shoot-escritorio', []], ['shoot-telefono', ['--width', '390', '--height', '844']]]) {
        const r = spawnSync(process.execPath, [shoot, '--url', URL_AI, '--out', path.join(RAIZ, dir), ...extra], { cwd: ESPACIO, encoding: 'utf8', maxBuffer: 64 << 20 })
        console.log(`\nscroll-craft shoot.mjs (${dir}):\n${cola(r.stdout + r.stderr, 30)}`)
      }
    } finally {
      try {
        if (process.platform === 'win32') dev2.kill()
        else process.kill(-dev2.pid, 'SIGTERM')
      } catch {}
    }
  }
}

escribir(path.join(RAIZ, 'informe.json'), JSON.stringify({ fecha: new Date().toISOString(), resultados }, null, 2))
const malos = resultados.filter((r) => !r.bien)
console.log(`\n${resultados.length - malos.length}/${resultados.length} pruebas bien${malos.length ? ` · ${malos.length} por resolver antes de generar el kit` : ' · listo para generar el kit'}`)
if (URL_ORIGINAL) console.log(`Comparación visual: ${path.join(RAIZ, 'comparacion-escritorio.jpg')} y comparacion-telefono.jpg`)
process.exit(malos.length ? 1 : 0)

// ---- the tests ---------------------------------------------------------------------------
async function contexto(opciones, extra = {}) {
  const ctx = await navegador.newContext({ ...opciones, ...extra })
  const externos = []
  const destinos = []
  // nothing leaves the machine: other sites are blocked, a page navigation to one is stubbed
  await ctx.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/]|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/, (r) => {
    if (r.request().resourceType() === 'document') {
      destinos.push(r.request().url())
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>destino</title><p>destino</p>' })
    }
    externos.push(r.request().url())
    return r.abort()
  })
  return { ctx, externos, destinos }
}

async function cargarPagina(p, url) {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForSelector('html.sc-ready', { timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(600)
}

async function recorrer(p, paso = 0.8) {
  const alto = await p.evaluate(() => document.documentElement.scrollHeight)
  const vh = await p.evaluate(() => innerHeight)
  for (let y = 0; y <= alto; y += Math.round(vh * paso)) {
    await p.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y)
    await p.waitForTimeout(120)
  }
  await p.waitForTimeout(600)
}

// lazy images off screen may not have started: load them all, then look
async function cargarImagenes(p) {
  await p.evaluate(async () => {
    const imgs = [...document.images].filter((i) => i.getClientRects().length)
    for (const i of imgs) i.loading = 'eager'
    await Promise.race([Promise.allSettled(imgs.map((i) => i.decode())), new Promise((r) => setTimeout(r, 10000))])
  })
}

async function funcional(vista, opciones, pedidos) {
  const { ctx, destinos, externos } = await contexto(opciones)
  const p = await ctx.newPage()
  const errores = []
  const fallidos = []
  const bloqueados = new Set()
  p.on('pageerror', (e) => errores.push(String(e.message || e)))
  p.on('console', (m) => {
    if (m.type() !== 'error') return
    // a third-party resource this test blocks on purpose is not the page's error
    const origen = m.location()?.url || ''
    if (/^Failed to load resource/.test(m.text()) && origen && !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(origen)) bloqueados.add(new URL(origen).hostname)
    else errores.push(m.text())
  })
  p.on('response', (r) => {
    const u = new URL(r.url())
    const k = porRuta.get(decodeURIComponent(u.pathname))
    if (k) pedidos.set(k, Math.max(pedidos.get(k) || 0, r.status()))
    else if (r.status() >= 400 && u.hostname === 'localhost') fallidos.push(`${r.status()} ${u.pathname}`)
  })
  p.on('requestfailed', (r) => {
    const u = new URL(r.url())
    if (u.hostname === 'localhost' && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) fallidos.push(`${r.failure()?.errorText} ${u.pathname}`)
  })
  await cargarPagina(p, URL_AI)
  ok(`${vista}: el motor de scroll-craft arrancó (html.sc-ready)`, true)
  await recorrer(p)
  await cargarImagenes(p)
  const estado = await p.evaluate(() => ({
    tokens: (document.documentElement.outerHTML.match(/@@asset:[^@]+@@/g) || []).slice(0, 5),
    imagenes: [...document.images].filter((i) => i.getClientRects().length).map((i) => ({ src: i.currentSrc || i.src, bien: i.complete && i.naturalWidth > 0 })),
    desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    titulo: document.title,
    lang: document.documentElement.lang,
    marcador: !!document.querySelector('[data-vibe-blank-page-placeholder]'),
  }))
  ok(`${vista}: la página reemplazó a la de la plantilla`, !estado.marcador && estado.titulo === (M.meta?.titulo || estado.titulo), `título: ${estado.titulo}`)
  if (M.meta?.lang) ok(`${vista}: idioma del documento (${M.meta.lang})`, estado.lang === M.meta.lang, estado.lang)
  ok(`${vista}: no quedaron rutas de assets sin resolver`, estado.tokens.length === 0, estado.tokens.join(', '))
  const rotas = estado.imagenes.filter((i) => !i.bien)
  ok(`${vista}: las ${estado.imagenes.length} imágenes visibles cargan`, rotas.length === 0, rotas.map((i) => i.src).join('\n'))
  ok(`${vista}: sin errores en la consola`, errores.length === 0, errores.slice(0, 6).join('\n'))
  if (bloqueados.size) nota(`Bloqueado en la prueba (sitios de terceros; revísalos en la URL publicada): ${[...bloqueados].join(', ')}`)
  ok(`${vista}: sin peticiones fallidas`, fallidos.length === 0, fallidos.slice(0, 8).join('\n'))

  if (M.gtm?.dominio) ok(`${vista}: Google Tag Manager no carga fuera de ${M.gtm.dominio}`, !externos.some((u) => /googletagmanager\.com/.test(u)))
  if (M.formulario?.existe) await probarFormulario(p, vista, destinos)
  await ctx.close()
}

async function probarFormulario(p, vista, destinos) {
  const antes = p.url()
  const selector = M.formulario.selector || 'form[data-ai-studio-form]'
  if (M.formulario.abrir) {
    // a form inside a dialog: open it the way a visitor does
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await p.waitForTimeout(300)
    const boton = p.locator(M.formulario.abrir).first()
    await (vista === 'telefono' ? boton.tap() : boton.click())
    await p.waitForSelector(selector, { timeout: 5000 }).catch(() => {})
    await p.waitForTimeout(500)
  }
  const envio = await p.evaluate((selector) => {
    const f = document.querySelector(selector)
    if (!f) return { hay: false }
    const valores = { email: 'prueba@example.com', tel: '5512345678', number: '1', url: 'https://example.com', date: '2026-10-01' }
    // through the native setter, so a script watching the fields sees the change too
    const poner = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    for (const el of f.querySelectorAll('input[name], select[name], textarea[name]')) {
      const t = (el.getAttribute('type') || '').toLowerCase()
      if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(t)) continue
      if (t === 'checkbox' || t === 'radio') {
        if (!el.checked) el.click()
      } else if (el.tagName === 'SELECT') poner(el, [...el.options].find((o) => o.value)?.value ?? el.value)
      else poner(el, valores[t] || (/mail|correo/i.test(el.name) ? valores.email : 'Prueba'))
    }
    const invalidos = [...f.elements].filter((e) => e.willValidate && !e.checkValidity()).map((e) => `${e.name}: ${e.validationMessage}`)
    const destino = f.dataset.destino || (/^https?:\/\//.test(f.getAttribute('action') || '') ? f.getAttribute('action') : '')
    f.requestSubmit()
    return { hay: true, invalidos, destino, nombres: [...new FormData(f).keys()] }
  }, selector)
  if (!envio.hay) {
    ok(`${vista}: el formulario está en la página`, false, `No encontré ${selector}`)
    return
  }
  const leads = await p
    .waitForFunction(() => (window.__leads || []).length > 0, null, { timeout: 5000 })
    .then(() => p.evaluate(() => window.__leads))
    .catch(() => [])
  if (grabadora) {
    // one object of fields (converted pages) or plain arguments (a hand-made seam)
    const porNombre = leads[0] && typeof leads[0] === 'object' && !Array.isArray(leads[0])
    const campos = porNombre ? Object.keys(leads[0]) : []
    const faltan = porNombre ? envio.nombres.filter((n) => !campos.includes(n)) : []
    ok(
      `${vista}: el formulario entrega sus campos a sendLeadToCrm (lo que AI Studio conecta al CRM)`,
      leads.length === 1 && faltan.length === 0,
      leads.length
        ? porNombre
          ? `campos: ${campos.join(', ')}${faltan.length ? ` · faltan: ${faltan.join(', ')}` : ''}`
          : `argumentos: ${JSON.stringify(leads[0])}`
        : `no llegó${envio.invalidos.length ? ` (inválidos: ${envio.invalidos.join('; ')})` : ''}`,
    )
  }
  const lead = await p.evaluate(() => (window.dataLayer || []).find((e) => e && e.event === 'lead') || null).catch(() => null)
  ok(`${vista}: evento «lead» para GTM, con el formId del CRM`, lead && lead.formId === M.formulario.formId, lead ? `formId: ${lead.formId}` : 'no se envió')
  if (envio.destino) {
    await p.waitForURL((u) => u.href !== antes, { timeout: 5000 }).catch(() => {})
    ok(`${vista}: después del envío va a su destino en la misma pestaña`, destinos.includes(envio.destino) || p.url() === envio.destino, p.url())
  }
}

async function comparar(vista, opciones) {
  // reduced motion makes both pages deterministic: the check is about layout and styles
  const medir = async (url) => {
    const { ctx } = await contexto(opciones, { reducedMotion: 'reduce' })
    const p = await ctx.newPage()
    await cargarPagina(p, url)
    const m = await p.evaluate(() => {
      // every element of the page, in order: its box and the styles a reset would change
      const props = ['display', 'position', 'margin', 'padding', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'color', 'backgroundColor', 'listStyleType', 'boxSizing', 'borderTopWidth', 'verticalAlign']
      const els = [document.documentElement, document.body, ...document.body.querySelectorAll('*')].filter(
        (e) => !['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(e.tagName) && !e.classList.contains('ai-pagina') && !e.closest('vite-error-overlay'),
      )
      const nombre = (e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).join('.')}` : '')
      const atributos = (e) => [...e.attributes].map((x) => `${x.name}="${x.value}"`).filter((x) => !/^(style|data-tsd-source|data-component-)/.test(x)).sort()
      return {
        alto: document.documentElement.scrollHeight,
        raiz: [...atributos(document.documentElement), '|', ...atributos(document.body)].join(' '),
        texto: document.body.innerText.replace(/\s+/g, ' ').trim(),
        h1: (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim(),
        fondo: getComputedStyle(document.body).backgroundColor,
        fuentes: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))].sort(),
        desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        elementos: els.map((e) => {
          const r = e.getBoundingClientRect()
          const cs = getComputedStyle(e)
          return { n: nombre(e), y: Math.round(r.top + scrollY), x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), s: props.map((k) => cs[k]) }
        }),
        props,
      }
    })
    const total = m.alto - (await p.evaluate(() => innerHeight))
    const fotos = []
    for (let i = 0; i <= 8; i++) {
      await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round((total * i) / 8))
      await p.waitForTimeout(450)
      fotos.push(await p.screenshot({ type: 'png', scale: 'css' }))
    }
    await ctx.close()
    return { m, fotos }
  }
  const o = await medir(URL_ORIGINAL)
  const n = await medir(URL_AI)
  ok(`${vista}: mide lo mismo que la original`, Math.abs(o.m.alto - n.m.alto) <= 2, `original ${o.m.alto}px · AI Studio ${n.m.alto}px`)
  // element by element: the first differences say what to fix (a reset, a selector…)
  const difs = []
  const eo = o.m.elementos
  const en = n.m.elementos
  for (let i = 0; i < Math.min(eo.length, en.length) && difs.length < 10; i++) {
    const x = eo[i]
    const y = en[i]
    const estilos = o.m.props.filter((_, k) => x.s[k] !== y.s[k]).map((k) => `${k}: ${x.s[o.m.props.indexOf(k)]} → ${y.s[o.m.props.indexOf(k)]}`)
    const caja = ['y', 'x', 'w', 'h'].filter((k) => Math.abs(x[k] - y[k]) > 1).map((k) => `${k} ${x[k]} → ${y[k]}`)
    if (x.n !== y.n) difs.push(`#${i} ${x.n} en la original, ${y.n} en AI Studio`)
    else if (estilos.length || caja.length) difs.push(`#${i} ${x.n}: ${[...estilos, ...caja].join(' · ')}`)
  }
  const mismos = eo.length === en.length && difs.length === 0
  ok(
    `${vista}: los ${eo.length} elementos tienen la misma caja y estilos que en la original`,
    mismos,
    mismos ? '' : `${eo.length !== en.length ? `original ${eo.length} elementos, AI Studio ${en.length}\n` : ''}${difs.join('\n')}`,
  )
  ok(`${vista}: los scripts de la página dejaron <html> y <body> como en la original`, o.m.raiz === n.m.raiz, o.m.raiz === n.m.raiz ? '' : `original:  ${o.m.raiz}\nAI Studio: ${n.m.raiz}`)
  ok(`${vista}: el mismo texto visible`, o.m.texto === n.m.texto, o.m.texto === n.m.texto ? `${o.m.texto.length} caracteres` : primeraDiferencia(o.m.texto, n.m.texto))
  ok(`${vista}: mismo encabezado, fondo y fuentes`, o.m.h1 === n.m.h1 && o.m.fondo === n.m.fondo && o.m.fuentes.join() === n.m.fuentes.join(), `h1 «${n.m.h1}» · fondo ${n.m.fondo} · fuentes ${n.m.fuentes.join(', ') || '(del sistema)'}${o.m.fuentes.join() !== n.m.fuentes.join() ? ` (original: ${o.m.fuentes.join(', ')})` : ''}${o.m.fondo !== n.m.fondo ? ` (original: ${o.m.fondo})` : ''}`)
  if (n.m.desborde > 0) ok(`${vista}: sin scroll horizontal`, o.m.desborde > 0, `${n.m.desborde}px${o.m.desborde > 0 ? ' (la original también lo tiene)' : ''}`)

  const hoja = await navegador.newPage()
  const pixeles = []
  for (let i = 0; i < o.fotos.length; i++) pixeles.push(await diferencia(hoja, o.fotos[i], n.fotos[i]))
  const peor = Math.max(...pixeles)
  ok(`${vista}: se ve igual que la original en 9 puntos del scroll`, peor <= 0.01, `píxeles distintos por posición: ${pixeles.map((d) => `${(d * 100).toFixed(1)}%`).join(' · ')}`)
  const jpg = await hojaComparacion(hoja, o.fotos, n.fotos, pixeles, vista)
  fs.writeFileSync(path.join(RAIZ, `comparacion-${vista}.jpg`), jpg)
  await hoja.close()
}

// share of pixels that differ clearly between two screenshots
async function diferencia(hoja, x, y) {
  return hoja.evaluate(
    async ([x, y]) => {
      const img = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${s}` })
      const [ix, iy] = await Promise.all([img(x), img(y)])
      const w = Math.min(ix.width, iy.width)
      const h = Math.min(ix.height, iy.height)
      const c = new OffscreenCanvas(w, h)
      const g = c.getContext('2d', { willReadFrequently: true })
      g.drawImage(ix, 0, 0)
      const dx = g.getImageData(0, 0, w, h).data
      g.clearRect(0, 0, w, h)
      g.drawImage(iy, 0, 0)
      const dy = g.getImageData(0, 0, w, h).data
      let n = 0
      for (let i = 0; i < dx.length; i += 4) {
        if (Math.abs(dx[i] - dy[i]) > 40 || Math.abs(dx[i + 1] - dy[i + 1]) > 40 || Math.abs(dx[i + 2] - dy[i + 2]) > 40) n++
      }
      return n / (w * h) + Math.abs(ix.height - iy.height) / Math.max(ix.height, iy.height)
    },
    [x.toString('base64'), y.toString('base64')],
  )
}

async function hojaComparacion(hoja, originales, nuevas, difs, vista) {
  const url = await hoja.evaluate(
    async ([os, ns, difs, vista]) => {
      const img = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${s}` })
      const a = await Promise.all(os.map(img))
      const b = await Promise.all(ns.map(img))
      const ancho = vista === 'telefono' ? 200 : 480
      const escala = ancho / a[0].width
      const alto = Math.round(a[0].height * escala)
      const cab = 34
      const c = document.createElement('canvas')
      const cols = vista === 'telefono' ? 3 : 1
      const filas = Math.ceil(a.length / cols)
      c.width = cols * (2 * ancho + 36) + 12
      c.height = cab + filas * (alto + 30) + 12
      const g = c.getContext('2d')
      g.fillStyle = '#16181c'
      g.fillRect(0, 0, c.width, c.height)
      g.font = '600 14px system-ui, sans-serif'
      g.fillStyle = '#e8e6e3'
      g.fillText(`Original  |  AI Studio   (${vista})`, 12, 22)
      a.forEach((ia, i) => {
        const x = 12 + (i % cols) * (2 * ancho + 36)
        const y = cab + Math.floor(i / cols) * (alto + 30)
        g.drawImage(ia, x, y + 18, ancho, alto)
        g.drawImage(b[i], x + ancho + 12, y + 18, ancho, alto)
        g.fillStyle = difs[i] > 0.02 ? '#ff7a6b' : '#9fd49a'
        g.fillText(`${Math.round((i / (a.length - 1)) * 100)}% del scroll · diferencia ${(difs[i] * 100).toFixed(1)}%`, x, y + 13)
      })
      return c.toDataURL('image/jpeg', 0.82)
    },
    [originales.map((f) => f.toString('base64')), nuevas.map((f) => f.toString('base64')), difs, vista],
  )
  return Buffer.from(url.split(',')[1], 'base64')
}

// ---- helpers -----------------------------------------------------------------------------
function primeraDiferencia(x, y) {
  let i = 0
  while (i < x.length && x[i] === y[i]) i++
  return `original: «…${x.slice(Math.max(0, i - 40), i + 60)}…»\nAI Studio: «…${y.slice(Math.max(0, i - 40), i + 60)}…»`
}

// as React writes text into the HTML
function escaparHtml(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

async function esperarHttp(url, ms) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

function servir(dir, puerto) {
  const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain' }
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (rel.endsWith('/')) rel += 'index.html'
    const f = path.join(dir, rel)
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404)
      return res.end()
    }
    const tam = fs.statSync(f).size
    const tipo = tipos[path.extname(f).toLowerCase()] || 'application/octet-stream'
    const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
    if (r && (r[1] || r[2])) {
      const ini = r[1] ? Number(r[1]) : Math.max(0, tam - Number(r[2]))
      const fin = r[1] && r[2] ? Math.min(Number(r[2]), tam - 1) : tam - 1
      res.writeHead(206, { 'Content-Type': tipo, 'Content-Range': `bytes ${ini}-${fin}/${tam}`, 'Accept-Ranges': 'bytes', 'Content-Length': fin - ini + 1 })
      return fs.createReadStream(f, { start: ini, end: fin }).pipe(res)
    }
    res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': tam, 'Accept-Ranges': 'bytes' })
    fs.createReadStream(f).pipe(res)
  })
  return new Promise((r) => srv.listen(puerto, () => r(srv)))
}

function buscarShoot() {
  const base = path.join(process.env.HOME || '', '.claude', 'plugins', 'cache')
  const hallados = []
  const buscar = (dir, nivel) => {
    if (nivel > 6 || !fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const p = path.join(dir, e.name)
      if (e.name === 'scroll-craft' && fs.existsSync(path.join(p, 'scripts', 'shoot.mjs'))) hallados.push(path.join(p, 'scripts', 'shoot.mjs'))
      else buscar(p, nivel + 1)
    }
  }
  buscar(base, 0)
  return hallados.sort().pop()
}
