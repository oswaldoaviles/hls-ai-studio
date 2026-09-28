#!/usr/bin/env node
// Does every page of the site look like the same brand? Compares each page of a
// scroll-craft site with its home, in Chrome:
// - its brand tokens (--sc-*);
// - the fonts that load;
// - the header's menu (links and style);
// - that it has a footer.
// Colours the home never uses are listed as notes.
//
//   node <skill>/scripts/coherencia.mjs <carpeta del sitio> [--puerto 4830]
//
// Its packages (playwright-core) come from the site's migration workspace,
// <sitio>-ai-studio, which migrar-a-ai-studio's doctor.mjs --preparar makes, from the
// current folder, or from HLS_ESPACIO.
import fs from 'node:fs'
import path from 'node:path'
import { args, cargar, servir } from '../../migrar-a-ai-studio/scripts/lib.mjs'

const a = args()
const SITIO = a._[0] && path.resolve(a._[0])
if (!SITIO || !fs.existsSync(path.join(SITIO, 'index.html'))) {
  console.error('Uso: node coherencia.mjs <carpeta del sitio, la que tiene su index.html>')
  process.exit(1)
}
const PUERTO = Number(a.puerto || 4830)
const espacio = [process.env.HLS_ESPACIO, process.cwd(), `${SITIO}-ai-studio`].find((d) => d && fs.existsSync(path.join(d, 'node_modules', 'playwright-core')))
if (!espacio) {
  console.error(`Falta playwright-core. Prepara el espacio de trabajo: node <plugin>/skills/migrar-a-ai-studio/scripts/doctor.mjs --preparar "${SITIO}-ai-studio"`)
  process.exit(1)
}

// the pages, as migrar-a-ai-studio finds them: the home first
const IGNORAR = new Set(['assets', 'node_modules', 'lab', 'export', 'dist', 'kit', 'archivos'])
function buscar(dir, rel = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (!IGNORAR.has(e.name)) out.push(...buscar(path.join(dir, e.name), r))
    } else if (/\.html?$/i.test(e.name)) out.push(r)
  }
  return out
}
const paginas = ['index.html', ...buscar(SITIO).filter((r) => r !== 'index.html').sort()]

const resultados = []
const ok = (nombre, bien, detalle = '') => {
  resultados.push(bien)
  console.log(`${bien ? '✓' : '✗'} ${nombre}${detalle ? `\n    ${String(detalle).split('\n').join('\n    ')}` : ''}`)
}
const nota = (m) => console.log(`  · ${m}`)

const srv = await servir(SITIO, PUERTO)
const { chromium } = await cargar('playwright-core', espacio)
const navegador = await chromium.launch({ channel: 'chrome', headless: true })
const medidas = {}
try {
  for (const rel of paginas) medidas[rel] = await medir(rel)
} finally {
  await navegador.close()
  srv.close()
}

const home = medidas['index.html']
if (!home || home.error) {
  ok('El home carga con el motor de scroll-craft', false, home?.error)
  process.exit(1)
}
for (const rel of paginas.slice(1)) {
  const m = medidas[rel]
  console.log(`\n${rel}`)
  if (m.error) {
    ok('carga con el motor de scroll-craft', false, m.error)
    continue
  }
  const tokens = Object.keys(home.tokens).filter((k) => home.tokens[k] !== m.tokens[k])
  ok('los mismos colores y tipografías de marca (--sc-*)', tokens.length === 0, tokens.map((k) => `${k}: ${home.tokens[k] || '(vacío)'} en el home, ${m.tokens[k] || '(vacío)'} aquí`).join('\n'))
  ok('las mismas fuentes cargadas', home.fuentes.join() === m.fuentes.join(), `home: ${home.fuentes.join(', ') || '(del sistema)'} · aquí: ${m.fuentes.join(', ') || '(del sistema)'}`)
  const menu = home.menu.join(' | ') === m.menu.join(' | ')
  ok('el mismo menú, con los mismos destinos', menu, menu ? '' : `home: ${home.menu.join(' | ')}\naquí: ${m.menu.join(' | ')}`)
  ok('el encabezado con el mismo estilo', home.encabezado === m.encabezado, home.encabezado === m.encabezado ? '' : `home: ${home.encabezado}\naquí: ${m.encabezado}`)
  ok('tiene pie de página', m.pie)
  const nuevos = m.colores.filter((c) => !home.colores.includes(c))
  if (nuevos.length) nota(`Colores que el home no usa (revisa que sean de la marca, ver MARCA.md): ${nuevos.slice(0, 8).join(', ')}`)
}
const malos = resultados.filter((x) => !x).length
console.log(`\n${resultados.length - malos}/${resultados.length} revisiones bien${malos ? ` · ${malos} por corregir` : ' · el sitio es coherente'}`)
process.exit(malos ? 1 : 0)

async function medir(rel) {
  const p = await navegador.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await p.goto(`http://localhost:${PUERTO}/${rel}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const listo = await p.waitForSelector('html.sc-ready', { timeout: 20000 }).then(() => true).catch(() => false)
    if (!listo) return { error: 'html.sc-ready nunca apareció: la página debe cargar scrollcraft.js y montarlo' }
    await p.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every((l) => l.sheet), null, { timeout: 20000 }).catch(() => {})
    await p.evaluate(() => document.fonts.ready)
    await p.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {})
    return await p.evaluate(() => {
      const raiz = getComputedStyle(document.documentElement)
      const nombres = ['--sc-canvas', '--sc-surface', '--sc-ink', '--sc-ink-soft', '--sc-accent', '--sc-accent-ink', '--sc-font-display', '--sc-font-text']
      const tokens = Object.fromEntries(nombres.map((k) => [k, raiz.getPropertyValue(k).trim()]))
      const fuentes = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))].sort()
      const header = document.querySelector('header')
      // the menu: its links (inside nav, or the whole header), as text → destination
      const destino = (a) => new URL(a.getAttribute('href') || '', location.href).pathname.replace(/(^|\/)index\.html?$/, '$1') || '/'
      const enlaces = header ? [...(header.querySelector('nav') || header).querySelectorAll('a')] : []
      const menu = enlaces.map((a) => `${a.textContent.trim()} → ${destino(a)}`)
      const hs = header && getComputedStyle(header)
      const encabezado = hs ? `${hs.position} · ${hs.backgroundImage !== 'none' ? hs.backgroundImage : hs.backgroundColor} · ${Math.round(header.getBoundingClientRect().height)}px` : '(sin encabezado)'
      const colores = new Set()
      for (const el of document.body.querySelectorAll('*')) {
        if (!el.getClientRects().length) continue
        const cs = getComputedStyle(el)
        for (const c of [cs.color, cs.backgroundColor]) if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') colores.add(c)
      }
      return { tokens, fuentes, menu, encabezado, pie: !!document.querySelector('footer'), colores: [...colores].sort() }
    })
  } catch (e) {
    return { error: String(e.message || e).split('\n')[0] }
  } finally {
    await p.close()
  }
}
