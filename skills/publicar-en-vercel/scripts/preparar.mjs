#!/usr/bin/env node
// Builds the folder Vercel receives (`<espacio>/sitio/`) from the student's site,
// without touching the site itself.
//
//   node preparar.mjs --sitio <carpeta del sitio> [--proyecto <nombre>]
//        first time: creates config.json with every page and form it finds, and stops
//        so Claude can fill in the GHL data with the student
//   node preparar.mjs
//        builds sitio/: the site's files + seguimiento.js in every page, form IDs,
//        clean internal links, ?v= on CSS/JS, canonical, vercel.json, robots, sitemap,
//        404 and extras/
//
// Run it in the workspace (or set HLS_ESPACIO).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ESPACIO, SKILL, args, aviso, archivosDelSitio, CONFIG, dominioLimpio, escribir, esPagina, formulariosDe,
  guardarConfig, hash, idDePagina, leer, leerConfig, leerEstado, no, ok, rutaLimpia, sitioDe, tieneContacto, vaAWhatsapp,
} from './lib.mjs'

const RE_TRACKING = /^tk_[a-f0-9]{32}$/
const RE_LOCATION = /^[A-Za-z0-9]{15,30}$/
const RE_GTM = /^GTM-[A-Z0-9]{4,10}$/

// ---- 1. the first time: config.json from what the site has ---------------------------

function nuevoConfig(sitio, proyecto) {
  const nombre = path.basename(sitio)
  // next to the site (../<nombre>), relative; anywhere else, the full path
  const rel = path.relative(ESPACIO, sitio) || '.'
  return {
    sitio: rel.split(path.sep).filter((x) => x === '..').length <= 1 ? rel : sitio,
    proyecto: (proyecto || nombre).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
    equipo: '',
    dominio: '',
    www: true,
    ghl: { locationId: '', trackingId: '' },
    gtm: '',
    telefono: { prefijo: '52', digitos: 10 },
    formularios: [],
    campos: {},
    redirecciones: [],
    excluir: [],
  }
}

/** Adds the forms the config doesn't know yet; returns the new ones. */
export function descubrirFormularios(c, sitio) {
  const nuevos = []
  const usados = new Set(c.formularios.map((f) => f.formId))
  for (const rel of archivosDelSitio(sitio, c.excluir).filter(esPagina)) {
    const forms = formulariosDe(leer(path.join(sitio, rel)))
    for (const f of forms) {
      if (c.formularios.some((x) => x.pagina === rel && x.indice === f.indice)) continue
      let formId = f.formId || idDePagina(rel)
      for (let n = 2; usados.has(formId); n++) formId = `${f.formId || idDePagina(rel)}-${n}`
      const contacto = tieneContacto(f)
      const entrada = {
        pagina: rel,
        indice: f.indice,
        id: f.id || '',
        formId,
        nombre: formId,
        incluir: contacto,
        parcial: contacto && f.campos.length > 1,
        campos: f.campos.map((x) => x.nombre),
      }
      if (!contacto) entrada.nota = vaAWhatsapp(f) ? 'va a WhatsApp: cuenta como Contact en Tag Manager, no crea contacto' : 'sin correo ni teléfono: no crea contacto'
      if (contacto) usados.add(formId)
      c.formularios.push(entrada)
      nuevos.push(entrada)
    }
  }
  return nuevos
}

// ---- 2. the HTML of each page ----------------------------------------------------------

const EXTERNO = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i

/** Resolves a reference of a page to a site path ("servicios/torno.html"), or null. */
function resolver(ref, paginaRel) {
  const limpio = ref.split('#')[0].split('?')[0]
  if (!limpio || EXTERNO.test(ref)) return null
  try {
    return decodeURIComponent(new URL(limpio, 'http://x/' + paginaRel).pathname.slice(1))
  } catch {
    return null
  }
}

export function transformarPagina(html, rel, ctx) {
  const { existe, version, c, formularios, dominio } = ctx
  const avisos = []

  // forms: data-form-id (and manual / destino) on the opening tag, from the last to the first
  const forms = formulariosDe(html)
  for (const f of [...forms].reverse()) {
    const conf = formularios.find((x) => x.pagina === rel && x.indice === f.indice)
    if (!conf || !conf.incluir) continue
    if (conf.id && f.id !== conf.id) avisos.push(`${rel}: el formulario ${f.indice + 1} ya no tiene el id "${conf.id}" (revisa config.json)`)
    let tag = f.apertura.replace(/\sdata-(form-id|seguimiento|destino)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    let extra = ` data-form-id="${conf.formId}"`
    if (conf.modo === 'manual') extra += ' data-seguimiento="manual"'
    tag = tag.replace(/\s*(\/?)>$/, `${extra}$1>`)
    html = html.slice(0, f.inicio) + tag + html.slice(f.inicio + f.apertura.length)
  }

  // internal links with their final address: /contacto, not contacto.html (no redirect)
  html = html.replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])([^"']*)\2/gi, (todo, pre, q, ref) => {
    if (!ref || EXTERNO.test(ref)) return todo
    const destino = resolver(ref, rel)
    if (destino === null) return todo
    const resto = ref.slice(ref.split('#')[0].split('?')[0].length)
    let archivo = destino
    if (archivo === '' || archivo.endsWith('/')) archivo += 'index.html'
    if (!/\.html?$/i.test(archivo) || !existe(archivo)) return todo
    return `${pre}${q}${rutaLimpia(archivo)}${resto}${q}`
  })

  // ?v=<hash> on the page's own CSS and JS (cached for a year, refreshed when they change).
  // Module scripts are left alone: a versioned and an unversioned import would load twice.
  html = html.replace(/<(script|link)\b[^>]*>/gi, (tag, tipo) => {
    if (/\stype\s*=\s*["']?module/i.test(tag) || /\srel\s*=\s*["']?modulepreload/i.test(tag)) return tag
    if (tipo.toLowerCase() === 'link' && !/\srel\s*=\s*["']?(stylesheet|preload)/i.test(tag)) return tag
    return tag.replace(/(\s(?:src|href)\s*=\s*)(["'])([^"'?#]+\.(?:css|js))\2/i, (t, pre, q, ref) => {
      const archivo = resolver(ref, rel)
      return archivo && existe(archivo) ? `${pre}${q}${ref}?v=${version(archivo)}${q}` : t
    })
  })

  // canonical, once the site has its domain
  const noindex = /<meta[^>]+name\s*=\s*["']robots["'][^>]+noindex/i.test(html)
  let cabeza = ''
  if (dominio && !noindex && !/rel\s*=\s*["']canonical/i.test(html) && !/^404\.html$/i.test(rel)) {
    cabeza += `<link rel="canonical" href="https://${dominio}${rutaLimpia(rel)}">\n`
  }
  cabeza += `<script src="/seguimiento.js?v=${version('seguimiento.js')}" defer></script>\n`
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${cabeza}</head>`)
  else html = cabeza + html

  // legal links that still go nowhere
  for (const m of html.matchAll(/<a\b[^>]*\shref\s*=\s*["']#["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const texto = m[1].replace(/<[^>]+>/g, '').trim()
    if (/privacidad|cookies|t[ée]rminos|aviso|legal/i.test(texto)) avisos.push(`${rel}: «${texto}» no lleva a ninguna página (href="#")`)
  }
  return { html, avisos, noindex }
}

// ---- 3. vercel.json ------------------------------------------------------------------------

export function vercelJson(c, sitio) {
  const d = dominioLimpio(c.dominio)
  const redirects = []
  if (d && c.www !== false) {
    const host = [{ type: 'host', value: `www.${d}` }]
    redirects.push({ source: '/', has: host, destination: `https://${d}/`, permanent: true })
    redirects.push({ source: '/:ruta*', has: host, destination: `https://${d}/:ruta*`, permanent: true })
  }
  for (const r of c.redirecciones) redirects.push({ source: r.desde, destination: r.hacia, permanent: r.permanente !== false })
  // redirects the site already had in its own vercel.json
  const propio = path.join(sitio, 'vercel.json')
  if (fs.existsSync(propio)) {
    try {
      for (const r of JSON.parse(leer(propio)).redirects || []) if (!redirects.some((x) => x.source === r.source && !x.has)) redirects.push(r)
    } catch {}
  }
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    cleanUrls: true,
    trailingSlash: false,
    redirects,
    headers: [
      // the *.vercel.app addresses never show up in Google: only the real domain
      { source: '/(.*)', has: [{ type: 'host', value: '(?<vercel>.*)\\.vercel\\.app' }], headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
      { source: '/(.*)\\.(css|js)', has: [{ type: 'query', key: 'v' }], headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ],
  }
}

// ---- 4. everything together ------------------------------------------------------------------

export function preparar(ws = ESPACIO, { silencioso = false } = {}) {
  const log = silencioso ? () => {} : console.log
  const c = leerConfig(ws)
  const sitio = sitioDe(c, ws)
  if (!fs.existsSync(path.join(sitio, 'index.html'))) throw new Error(`No encuentro ${path.join(sitio, 'index.html')}: revisa "sitio" en config.json`)
  const dominio = dominioLimpio(c.dominio)
  const salida = path.join(ws, 'sitio')
  const avisos = []
  const errores = []

  // data the student gives (the build still works without it: nothing is sent)
  if (!RE_LOCATION.test(c.ghl.locationId || '')) avisos.push('Falta el Location ID de GHL (o no se ve bien): los formularios no van a llegar al CRM.')
  if (!RE_TRACKING.test(c.ghl.trackingId || '')) avisos.push('Falta el Tracking ID de GHL (tk_…, 32 caracteres después de tk_): los formularios no van a llegar al CRM.')
  if (c.gtm && !RE_GTM.test(c.gtm)) errores.push(`El contenedor de Tag Manager "${c.gtm}" no parece válido (GTM-XXXXXXX).`)

  // new pages or forms since last time
  const nuevos = descubrirFormularios(c, sitio)
  if (nuevos.length) {
    guardarConfig(c, ws)
    for (const f of nuevos) avisos.push(`Formulario nuevo en ${f.pagina}: form ID "${f.formId}"${f.incluir ? '' : ` (no se conecta: ${f.nota})`}. Confírmalo con el alumno.`)
  }

  // clean sitio/ but keep the link to the Vercel project
  fs.mkdirSync(salida, { recursive: true })
  for (const e of fs.readdirSync(salida)) if (e !== '.vercel' && !e.startsWith('.env')) fs.rmSync(path.join(salida, e), { recursive: true, force: true })

  const archivos = archivosDelSitio(sitio, c.excluir)
  for (const rel of archivos) {
    const mb = fs.statSync(path.join(sitio, rel)).size / 1048576
    if (mb > 25) avisos.push(`${rel} pesa ${mb.toFixed(0)} MB: comprímelo o ponlo en "excluir" si no es parte del sitio. Vercel no acepta archivos de más de 100 MB.`)
  }
  const extras = path.join(ws, 'extras')
  const deExtras = fs.existsSync(extras) ? archivosDelSitio(extras) : []
  const todos = new Set([...archivos, ...deExtras, 'seguimiento.js'])
  const origen = (rel) => (deExtras.includes(rel) ? path.join(extras, rel) : path.join(sitio, rel))

  // seguimiento.js: its configuration on top of the template
  const formularios = c.formularios.filter((f) => f.incluir)
  const conf = {
    trackingId: c.ghl.trackingId || '',
    locationId: c.ghl.locationId || '',
    gtm: c.gtm || '',
    dominios: [dominio, ...(c.dominiosExtra || []).map(dominioLimpio)].filter(Boolean),
    telefono: c.telefono,
    formularios: Object.fromEntries(formularios.map((f) => [f.formId, { nombre: f.nombre || f.formId, parcial: f.parcial !== false, destino: f.destino || '', gracias: f.gracias || '' }])),
    campos: c.campos,
  }
  const seguimiento = `/* Configuración: config.json del espacio de publicación. */\nwindow.SEGUIMIENTO = ${JSON.stringify(conf, null, 2)};\n\n${leer(path.join(SKILL, 'templates', 'seguimiento.js'))}`
  const versiones = new Map([['seguimiento.js', hash(seguimiento)]])
  const version = (rel) => {
    if (!versiones.has(rel)) versiones.set(rel, hash(fs.readFileSync(origen(rel))))
    return versiones.get(rel)
  }
  const existe = (rel) => todos.has(rel)
  escribir(path.join(salida, 'seguimiento.js'), seguimiento)

  // pages and files
  const paginas = []
  let bytes = 0
  const grandes = []
  for (const rel of todos) {
    if (rel === 'seguimiento.js') continue
    const de = origen(rel)
    const a = path.join(salida, rel)
    fs.mkdirSync(path.dirname(a), { recursive: true })
    const tam = fs.statSync(de).size
    bytes += tam
    if (tam > 50 * 1024 * 1024) grandes.push(`${rel} (${(tam / 1048576).toFixed(0)} MB)`)
    if (esPagina(rel) && !deExtras.includes(rel)) {
      const r = transformarPagina(leer(de), rel, { existe, version, c, formularios, dominio })
      fs.writeFileSync(a, r.html)
      avisos.push(...r.avisos)
      paginas.push({ rel, ruta: rutaLimpia(rel), noindex: r.noindex, fecha: fs.statSync(de).mtime })
    } else fs.copyFileSync(de, a)
  }
  // pages with a form in config.json that no longer exists
  for (const f of formularios) {
    if (!archivos.includes(f.pagina)) errores.push(`config.json conecta un formulario de ${f.pagina}, que ya no existe.`)
    else if (!formulariosDe(leer(path.join(sitio, f.pagina)))[f.indice]) errores.push(`${f.pagina} ya no tiene el formulario ${f.indice + 1} de config.json.`)
  }

  // vercel.json, .vercelignore, robots, sitemap, 404
  escribir(path.join(salida, 'vercel.json'), JSON.stringify(vercelJson(c, sitio), null, 2) + '\n')
  escribir(path.join(salida, '.vercelignore'), '.env*\n')
  if (!todos.has('robots.txt')) {
    escribir(path.join(salida, 'robots.txt'), `User-agent: *\nAllow: /\n${dominio ? `\nSitemap: https://${dominio}/sitemap.xml\n` : ''}`)
  }
  if (dominio && !todos.has('sitemap.xml')) {
    const urls = paginas
      .filter((p) => !p.noindex && !/(^|\/)(404|gracias[^/]*)\.html?$/i.test(p.rel))
      .sort((a, b) => a.ruta.length - b.ruta.length || a.ruta.localeCompare(b.ruta))
      .map((p) => `  <url><loc>https://${dominio}${p.ruta === '/' ? '/' : p.ruta}</loc><lastmod>${p.fecha.toISOString().slice(0, 10)}</lastmod></url>`)
    escribir(path.join(salida, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
  }
  if (!todos.has('404.html')) {
    const home = leer(path.join(sitio, 'index.html'))
    const estilos = [...home.matchAll(/<link\b[^>]*rel\s*=\s*["']?(stylesheet|preconnect|preload)[^>]*>/gi)].map((m) => m[0].replace(/href\s*=\s*(["'])(?![a-z]+:|\/)/i, 'href=$1/')).join('\n')
    const titulo = (home.match(/<title>([^<]*)<\/title>/i) || [, ''])[1].split(/[|·—–-]/)[0].trim()
    const p404 = leer(path.join(SKILL, 'templates', '404.html')).replace('{{ESTILOS}}', estilos).replaceAll('{{NOMBRE}}', titulo || 'Inicio')
    escribir(path.join(salida, '404.html'), p404.replace('</head>', `<script src="/seguimiento.js?v=${version('seguimiento.js')}" defer></script>\n</head>`))
  }

  if (grandes.length) avisos.push(`Archivos muy pesados (tardan en subir y en cargar): ${grandes.join(', ')}`)
  const mb = (bytes / 1048576).toFixed(1)
  log(`\nSitio preparado en ${salida}`)
  log(`  ${paginas.length} página(s), ${todos.size} archivos, ${mb} MB`)
  for (const p of paginas) log(`  ${p.ruta}${p.noindex ? '  (noindex)' : ''}`)
  log(`\nFormularios:`)
  for (const f of c.formularios) {
    log(`  ${f.incluir ? '✓' : '·'} ${f.pagina} #${f.indice + 1}${f.id ? ` (${f.id})` : ''} → ${f.incluir ? `form ID "${f.formId}"${f.parcial !== false ? ` + "${f.formId}-parcial"` : ''}${f.modo === 'manual' ? ' (manual)' : ''}` : f.nota || 'no se conecta'}`)
  }
  if (!c.formularios.length) log('  (ninguno)')
  log(`\nGHL: ${c.ghl.locationId ? 'location ' + c.ghl.locationId : 'sin Location ID'} · ${c.ghl.trackingId ? c.ghl.trackingId : 'sin Tracking ID'}${c.gtm ? ` · Tag Manager ${c.gtm}` : ' · sin Tag Manager'}`)
  log(`Dominio: ${dominio || '(todavía no: solo la dirección de Vercel)'}`)
  if (avisos.length) log('')
  for (const a of avisos) silencioso || aviso(a)
  for (const e of errores) silencioso || no(e)
  return { salida, paginas, avisos, errores, config: c, estado: leerEstado(ws) }
}

// ---- CLI ----------------------------------------------------------------------------------------

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args()
  try {
    if (!fs.existsSync(CONFIG())) {
      if (!a.sitio) {
        no('Falta el sitio. Uso: node preparar.mjs --sitio <carpeta del sitio> [--proyecto <nombre>]')
        process.exit(1)
      }
      const sitio = path.resolve(a.sitio)
      if (!fs.existsSync(path.join(sitio, 'index.html'))) {
        no(`${sitio} no tiene index.html: ¿es la carpeta del sitio?`)
        process.exit(1)
      }
      const c = nuevoConfig(sitio, a.proyecto)
      descubrirFormularios(c, sitio)
      guardarConfig(c)
      ok(`Creé ${CONFIG()}`)
      console.log(`  Sitio: ${sitio}\n  Proyecto de Vercel: ${c.proyecto}`)
      console.log('\nFormularios encontrados:')
      for (const f of c.formularios) {
        console.log(`  ${f.incluir ? '✓' : '·'} ${f.pagina} #${f.indice + 1}${f.id ? ` (${f.id})` : ''}: ${f.campos.join(', ') || 'sin campos'} → ${f.incluir ? `form ID "${f.formId}"` : f.nota}`)
      }
      if (!c.formularios.length) console.log('  (ninguno)')
      console.log('\nSiguiente: llena en config.json ghl.locationId, ghl.trackingId y, si tiene, gtm. Luego corre preparar.mjs otra vez.')
      process.exit(0)
    }
    const r = preparar()
    process.exit(r.errores.length ? 1 : 0)
  } catch (e) {
    no(e.message)
    process.exit(1)
  }
}
