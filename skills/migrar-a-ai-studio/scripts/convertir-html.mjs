#!/usr/bin/env node
// Turns a scroll-craft build (one page or a whole site) into the files of an AI Studio
// project (TanStack Start), keeping every page exactly as it is: the markup goes in as
// text (not translated to JSX), the scroll engine mounts on load, each page's CSS and
// <script>s keep their order, every assets/ reference becomes a token resolved against
// the URLs the chat gives when the files are uploaded, links between pages become
// routes, and forms are wired to AI Studio's own CRM connection.
//
//   cd <workspace>                     (made by doctor.mjs --preparar)
//   node <skill>/scripts/convertir-html.mjs <build> --plantilla <blank-project.zip>
//        [--form-id <id>] [--form-ids contacto=<id>,servicios-web=<id>]
//        [--dominio midominio.com] [--html index.html] [--nombre "Mi sitio"] [--gtm GTM-XXXX]
//
// Every *.html of the build is a page: index.html → /, contacto.html → /contacto,
// servicios/web.html → /servicios/web. --html converts only that page, as the home.
// --dominio adds the SEO that needs the final address: canonical URLs, og:url,
// structured data, robots.txt with the sitemap, and sitemap.xml (the "SEO final").
//
// Writes archivos/ (the files, at their paths in the project) and manifiesto.json
// (their order, the pages, the images to upload, the forms, warnings) in the workspace.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ESPACIO,
  LIMITE_LINEAS,
  abrirZip,
  args,
  cargar,
  cssSinComentarios,
  escribir,
  jsSinComentarios,
  leer,
  lineas,
  literal,
  normalizar,
} from './lib.mjs'

const a = args()
const BUILD = a._[0] && path.resolve(a._[0])
if (!BUILD || !a.plantilla) {
  console.error('Uso: node convertir-html.mjs <carpeta-del-build> --plantilla <zip-del-proyecto-en-blanco>')
  process.exit(1)
}
const PLANTILLAS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates')
const OUT = path.join(ESPACIO, 'archivos')
const avisos = []
const aviso = (m) => {
  avisos.push(m)
  console.log(`  ! ${m}`)
}
const parse5 = await cargar('parse5')
const anterior = (() => {
  try {
    return JSON.parse(leer(path.join(ESPACIO, 'manifiesto.json')))
  } catch {
    return null
  }
})()

// ---- tree helpers -------------------------------------------------------------
const hijos = (n) => (n.childNodes || []).filter((c) => c.tagName)
const attr = (n, k) => (n.attrs || []).find((x) => x.name === k)?.value
const texto = (n) => (n.childNodes || []).map((c) => (c.nodeName === '#text' ? c.value : texto(c))).join('')
function todos(n, fn, out = []) {
  for (const c of n.childNodes || []) {
    if (c.tagName) {
      if (fn(c)) out.push(c)
      if (c.tagName !== 'template') todos(c, fn, out)
    }
  }
  return out
}
const esLocal = (u) => u && !/^(https?:)?\/\//.test(u) && !/^(data|mailto|tel|javascript):/i.test(u) && !u.startsWith('#')
const esMotor = (u) => /(^|\/)scrollcraft\.(js|css)$/.test(u || '')
const q = JSON.stringify
const num = (i) => String(i + 1).padStart(2, '0')

// ---- the pages of the site ----------------------------------------------------------
const IGNORAR = new Set(['assets', 'node_modules', 'lab', 'export', 'dist', 'kit', 'archivos'])
function buscarPaginas(dir, rel = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (!IGNORAR.has(e.name) && !e.name.endsWith('-ai-studio')) out.push(...buscarPaginas(path.join(dir, e.name), r))
    } else if (/\.html?$/i.test(e.name)) out.push(r)
  }
  return out
}
const segmento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function rutaDe(rel) {
  const partes = rel.replace(/\.html?$/i, '').split('/').map(segmento)
  if (partes.at(-1) === 'index') partes.pop()
  return '/' + partes.filter(Boolean).join('/')
}
const idDe = (ruta) => (ruta === '/' ? 'inicio' : ruta.slice(1).replace(/\//g, '-'))
let rels = typeof a.html === 'string' ? [a.html] : buscarPaginas(BUILD)
if (!rels.length) throw new Error(`No encontré páginas .html en ${BUILD}`)
if (typeof a.html !== 'string' && !rels.includes('index.html')) throw new Error('El sitio necesita un index.html: es su página principal.')
rels = [...rels.filter((r) => r === 'index.html' || typeof a.html === 'string'), ...rels.filter((r) => r !== 'index.html' && typeof a.html !== 'string').sort()]
const PAGINAS = rels.map((rel, i) => {
  // with --html, that one page is the home, whatever its name
  const ruta = typeof a.html === 'string' || i === 0 ? '/' : rutaDe(rel)
  return { rel, ruta, id: idDe(ruta), esHome: ruta === '/', archivo: path.join(BUILD, rel) }
})
const repetidas = PAGINAS.map((p) => p.ruta).filter((r, i, arr) => arr.indexOf(r) !== i)
if (repetidas.length) throw new Error(`Dos páginas darían la misma dirección (${[...new Set(repetidas)].join(', ')}): renombra una.`)
const rutaPorRel = new Map(PAGINAS.map((p) => [p.rel, p.ruta]))

// a path written in a page, as a path from the build's root
function desdeRaiz(pagina, href) {
  const limpio = href.split(/[?#]/)[0]
  return limpio.startsWith('/') ? path.posix.normalize(limpio.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(pagina.rel), limpio))
}

// ---- assets: every relative assets/ reference becomes @@asset:<name>@@ --------
const assetsUsados = new Set()
function tokenizar(t) {
  return t
    .replace(/url\(\s*(['"]?)(?:\.\/|\/|(?:\.\.\/)+)?assets\/([^'")\s?#]+)[^'")\s]*\1\s*\)/g, (_m, comilla, n) => {
      assetsUsados.add(n)
      return `url(${comilla}@@asset:${n}@@${comilla})`
    })
    .replace(/(^|["'\s,=(])(?:\.\/|\/|(?:\.\.\/)+)?assets\/([^"'\s,)?#<>]+)/g, (_m, pre, n) => {
      assetsUsados.add(n)
      return `${pre}@@asset:${n}@@`
    })
}
const ajustarBody = (css) => css.replace(/(^|[\s,{}])(html\s*>\s*)?body\s*>\s*/g, '$1$2body > .ai-pagina > ')

// ---- stylesheets shared by the pages (sitio.css): once, not in every page ---------------
const docs = new Map(PAGINAS.map((p) => {
  const src = leer(p.archivo)
  return [p.rel, { src, doc: parse5.parse(src, { sourceCodeLocationInfo: true }) }]
}))
const partesDoc = (d) => {
  const htmlEl = hijos(d).find((n) => n.tagName === 'html')
  return { htmlEl, head: hijos(htmlEl).find((n) => n.tagName === 'head'), body: hijos(htmlEl).find((n) => n.tagName === 'body') }
}
const usoHojas = new Map()
for (const p of PAGINAS) {
  const { head } = partesDoc(docs.get(p.rel).doc)
  for (const n of head ? hijos(head) : []) {
    const href = attr(n, 'href') || ''
    if (n.tagName === 'link' && /stylesheet/i.test(attr(n, 'rel') || '') && esLocal(href) && !esMotor(href)) {
      const r = desdeRaiz(p, href)
      usoHojas.set(r, (usoHojas.get(r) || 0) + 1)
    }
  }
}
const COMPARTIDAS = [...usoHojas].filter(([, n]) => n > 1 && PAGINAS.length > 1).map(([r]) => r)

// ---- one page -----------------------------------------------------------------------------
async function convertirPagina(p) {
  const { src, doc } = docs.get(p.rel)
  const { htmlEl, head, body } = partesDoc(doc)
  const lang = attr(htmlEl, 'lang') || 'es'
  const metaTags = head ? hijos(head).filter((n) => n.tagName === 'meta') : []
  const viewport = metaTags.find((m) => attr(m, 'name') === 'viewport')
  const cover = /viewport-fit\s*=\s*cover/.test(attr(viewport || {}, 'content') || '')
  const tituloEl = head && hijos(head).find((n) => n.tagName === 'title')
  const titulo = (tituloEl && texto(tituloEl).trim()) || 'Mi sitio'
  const metas = metaTags
    .filter((m) => (attr(m, 'name') && !['viewport', 'theme-color-scheme'].includes(attr(m, 'name'))) || attr(m, 'property'))
    .map((m) => (attr(m, 'property') ? { property: attr(m, 'property'), content: attr(m, 'content') || '' } : { name: attr(m, 'name'), content: attr(m, 'content') || '' }))
  const descripcion = metas.find((m) => m.name === 'description')?.content || ''
  for (const m of metas) {
    const x = m.content.match(/^(?:\.\/|\/|(?:\.\.\/)+)?assets\/(.+)$/)
    if (x) assetsUsados.add(x[1])
  }
  const links = []
  let css = ''
  let vioEstilo = false
  const hojas = [] // shared stylesheets this page links, in order
  let icono = null
  const scriptsHead = []
  for (const n of head ? hijos(head) : []) {
    if (n.tagName === 'link') {
      const rel = (attr(n, 'rel') || '').toLowerCase()
      const href = attr(n, 'href') || ''
      if (rel.includes('stylesheet')) {
        if (esMotor(href)) continue
        if (esLocal(href)) {
          const r = desdeRaiz(p, href)
          // a shared sheet goes once for the whole site, if it comes before the page's own CSS
          if (COMPARTIDAS.includes(r) && !vioEstilo) hojas.push(r)
          else if (fs.existsSync(path.join(BUILD, r))) css += `\n/* ${href} */\n` + leer(path.join(BUILD, r))
          else aviso(`${p.rel}: la hoja ${href} no existe en el build; se omitió.`)
        } else links.push({ rel: 'stylesheet', href })
      } else if (rel.includes('preconnect') || rel.includes('dns-prefetch')) {
        links.push({ rel, href, ...(attr(n, 'crossorigin') !== undefined ? { crossOrigin: 'anonymous' } : {}) })
      } else if (rel.includes('icon')) {
        icono = esLocal(href) ? { asset: tokenizar(href).replace(/^@@asset:|@@$/g, '') } : { href }
      }
    } else if (n.tagName === 'style') {
      vioEstilo = true
      css += '\n' + texto(n)
    } else if (n.tagName === 'script') {
      const s = attr(n, 'src')
      if (s && esMotor(s)) continue
      const extra = atributosScript(n)
      if (s && esLocal(s)) scriptsHead.push({ codigo: leer(path.join(BUILD, desdeRaiz(p, s))), ...extra })
      else if (s) scriptsHead.push({ src: s, ...extra })
      else if (texto(n).trim()) scriptsHead.push({ codigo: texto(n), ...extra })
    }
  }

  // ---- body: the markup as it is, minus <script>s, forms marked, links made routes --------
  const loc = body.sourceCodeLocation
  const bodyIni = loc?.startTag ? loc.startTag.endOffset : head?.sourceCodeLocation?.endOffset ?? 0
  const bodyFin = loc?.endTag ? loc.endTag.startOffset : src.length
  const atributosBody = Object.fromEntries((body.attrs || []).map((x) => [x.name, x.value]))
  const ediciones = [] // [offset, deleteCount, insert]
  const scriptsBody = []
  let opcionesMotor = 'undefined'
  for (const s of todos(body, (n) => n.tagName === 'script')) {
    const l = s.sourceCodeLocation
    ediciones.push([l.startOffset, l.endOffset - l.startOffset, ''])
    const sSrc = attr(s, 'src')
    const tipo = attr(s, 'type') || ''
    const modulo = tipo === 'module'
    if (sSrc && esMotor(sSrc)) continue
    if (sSrc && esLocal(sSrc)) {
      scriptsBody.push({ codigo: leer(path.join(BUILD, desdeRaiz(p, sSrc))), modulo })
      continue
    }
    if (sSrc) {
      scriptsHead.push({ src: sSrc, ...atributosScript(s) })
      continue
    }
    if (tipo && !/javascript|module/.test(tipo)) {
      // data, not code (JSON-LD, say): it goes to the <head>, with its type
      if (texto(s).trim()) scriptsHead.push({ codigo: texto(s), tipo })
      continue
    }
    let codigo = texto(s)
    // the page mounts the engine itself: Pagina.tsx does it now, once per page on screen
    const montaje = codigo.match(/(?:window\.)?ScrollCraft\.mount\(\s*(?:document\.body\s*)?(?:,\s*(\{[\s\S]*?\}))?\s*\)\s*;?/)
    if (montaje) {
      if (montaje[1]) opcionesMotor = montaje[1]
      codigo = codigo.replace(montaje[0], '')
    }
    if (/ScrollCraft\.mount\(/.test(codigo)) aviso(`${p.rel} monta el motor sobre otra raíz (ScrollCraft.mount(...)): revísalo, porque la página ya lo monta sobre document.body.`)
    if (codigo.trim()) scriptsBody.push({ codigo, modulo })
  }
  // links to the other pages of the site become their routes
  const fuera = new Set()
  for (const n of todos(body, (x) => x.tagName === 'a')) {
    const href = attr(n, 'href') || ''
    if (!esLocal(href) || !/\.html?([?#]|$)/i.test(href)) continue
    const destino = rutaPorRel.get(desdeRaiz(p, href))
    const l = n.sourceCodeLocation?.attrs?.href
    if (destino && l) ediciones.push([l.startOffset, l.endOffset - l.startOffset, `href=${q(destino + (href.match(/[?#].*$/)?.[0] || ''))}`])
    else fuera.add(href)
  }
  if (fuera.size) aviso(`${p.rel} enlaza a páginas que no se migran (${[...fuera].join(', ')}): cambia esos enlaces por URLs completas o agrega esas páginas al build.`)
  const formularios = todos(body, (n) => n.tagName === 'form')
  const ids = idsDeFormularios(p, formularios.length)
  formularios.forEach((f, i) => ediciones.push([f.sourceCodeLocation.startTag.startOffset + 5, 0, ` data-ai-studio-form data-form-id=${q(ids[i])}`]))
  ediciones.sort((x, y) => x[0] - y[0])
  const nuevo = (off) => ediciones.reduce((d, [o, del, ins]) => (o < off ? d - Math.min(del, off - o) + ins.length : d), off)
  let cuerpo = ''
  let cursor = bodyIni
  for (const [o, del, ins] of ediciones) {
    if (o < bodyIni || o > bodyFin) continue
    cuerpo += src.slice(cursor, o) + ins
    cursor = o + del
  }
  cuerpo += src.slice(cursor, bodyFin)
  const base = nuevo(bodyIni)

  // chunk boundaries at top-level elements (or inside one that is too big)
  const cortes = (n) => {
    const out = []
    for (const c of hijos(n)) {
      if (c.tagName === 'script') continue
      const l = c.sourceCodeLocation
      const tam = l.endOffset - l.startOffset
      out.push(nuevo(l.startOffset) - base)
      if (tam > LIMITE_TROZO && hijos(c).some((h) => h.tagName !== 'script')) out.push(...cortes(c))
    }
    return out
  }
  const puntos = [...new Set([0, ...cortes(body)])].sort((x, y) => x - y).filter((x) => x >= 0 && x < cuerpo.length)
  const trozosHtml = []
  let actual = ''
  for (let i = 0; i < puntos.length; i++) {
    const pieza = cuerpo.slice(puntos[i], puntos[i + 1] ?? cuerpo.length)
    if (actual && (Buffer.byteLength(actual + pieza) > LIMITE_TROZO || lineas(actual + pieza) > 280)) {
      trozosHtml.push(actual)
      actual = ''
    }
    actual += pieza
  }
  if (actual) trozosHtml.push(actual)
  if (trozosHtml.join('') !== cuerpo) throw new Error(`${p.rel}: los trozos del HTML no reconstruyen el cuerpo`)
  // chunks start at elements, so no assets/ reference is cut in two
  for (let i = 0; i < trozosHtml.length; i++) trozosHtml[i] = tokenizar(trozosHtml[i])
  if (trozosHtml.some((t) => lineas(t) > LIMITE_LINEAS || Buffer.byteLength(t) > 11 * 1024)) aviso(`${p.rel}: un bloque de HTML no se pudo partir por debajo del límite (un elemento enorme sin hijos); revisa sus html-NN.ts.`)

  // ---- CSS --------------------------------------------------------------------------------
  const cssLimpio = cssSinComentarios(css)
  if ((await normalizar('p.css', css)) !== (await normalizar('p.css', cssLimpio))) throw new Error(`${p.rel}: quitar comentarios cambió el CSS`)
  let cssFinal = cssLimpio
  if (/(^|[\s,{}])(html\s*>\s*)?body\s*>/.test(cssFinal)) {
    cssFinal = ajustarBody(cssFinal)
    aviso(`${p.rel}: el CSS usaba "body > …"; se ajustó a "body > .ai-pagina > …" (la página vive dentro de un contenedor).`)
  }
  cssFinal = tokenizar(cssFinal)
  const trozosCss = cssFinal.trim() ? partirPorBytes(cssFinal, 'p.css') : []
  const scriptsPagina = scriptsBody.map((x) => ({ modulo: x.modulo, partes: partirPorBytes(tokenizar(x.codigo), 'p.js') }))
  for (const s of scriptsHead) if (s.codigo && /googletagmanager\.com\/gtm\.js/.test(s.codigo)) aviso(`${p.rel} ya trae un snippet de Google Tag Manager; se mantiene en el <head> tal cual (no pases --gtm).`)

  const campos = formularios.map((f, i) => ({
    formId: ids[i],
    destino: attr(f, 'action') || '',
    campos: todos(f, (n) => ['input', 'select', 'textarea'].includes(n.tagName))
      .filter((n) => attr(n, 'name') && !['submit', 'button', 'reset', 'image'].includes((attr(n, 'type') || '').toLowerCase()))
      .map((n) => ({
        name: attr(n, 'name'),
        tipo: n.tagName === 'input' ? (attr(n, 'type') || 'text').toLowerCase() : n.tagName,
        etiqueta: attr(n, 'aria-label') || attr(n, 'placeholder') || (attr(n, 'id') && todos(body, (x) => x.tagName === 'label' && attr(x, 'for') === attr(n, 'id')).map(texto)[0]?.trim()) || attr(n, 'name'),
        requerido: attr(n, 'required') !== undefined,
      })),
  }))
  return { ...p, lang, cover, titulo, metas, descripcion, links, icono, scriptsHead, hojas, trozosHtml, trozosCss, scriptsPagina, opcionesMotor, atributosBody, formularios: campos }
}

// type (module, or data such as JSON-LD), async and defer survive the move
function atributosScript(n) {
  const tipo = (attr(n, 'type') || '').trim()
  return {
    ...(tipo && !/^(text|application)\/(java|ecma)script$/i.test(tipo) ? { tipo } : {}),
    ...(attr(n, 'async') !== undefined ? { async: true } : {}),
    ...(attr(n, 'defer') !== undefined ? { defer: true } : {}),
  }
}

const LIMITE_TROZO = 9 * 1024
function partirPorBytes(t, archivo) {
  const ls = t.split('\n')
  const out = []
  let ini = 0
  let tam = 0
  let ok = -1
  for (let i = 0; i < ls.length; i++) {
    tam += Buffer.byteLength(ls[i]) + 1
    const l = ls[i].trimEnd()
    if (l === '' || /\}\s*$/.test(l) || (!archivo.endsWith('.css') && /^\s*[})\]][;,)]*$/.test(l))) ok = i
    if ((tam > LIMITE_TROZO || i - ini > 280) && ok >= ini) {
      out.push(ls.slice(ini, ok + 1).join('\n') + '\n')
      ini = ok + 1
      tam = ls.slice(ini, i + 1).reduce((s, x) => s + Buffer.byteLength(x) + 1, 0)
      ok = -1
    }
  }
  const resto = ls.slice(ini).join('\n')
  if (resto.trim()) out.push(resto)
  if (out.join('') !== t) throw new Error(`${archivo}: las partes no reconstruyen el texto`)
  return out
}

// One generic, evergreen ID per form unless the student gives one: `registro` on the
// home, the page's id elsewhere (`contacto`…); a second form on a page adds -2. The ID
// is also the form's name in the CRM, the contact's source and the medium. A new run
// (the SEO final, a new page) keeps the IDs chosen before.
function idsDeFormularios(p, n) {
  const dados = Object.fromEntries(
    String(typeof a['form-ids'] === 'string' ? a['form-ids'] : '')
      .split(',')
      .map((x) => x.split('=').map((y) => y.trim()))
      .filter((x) => x.length === 2 && x[0] && x[1]),
  )
  const previos = (anterior?.formulario?.formularios || []).filter((f) => (f.pagina || 'inicio') === p.id).map((f) => f.formId)
  const base =
    (p.esHome && typeof a['form-id'] === 'string' && a['form-id'].trim()) ||
    dados[p.id] ||
    previos[0] ||
    (p.esHome ? anterior?.formulario?.formId : null) ||
    (p.esHome ? 'registro' : p.id)
  return Array.from({ length: n }, (_, i) => (i === 0 ? base : previos[i] || `${base}-${i + 1}`))
}

// ---- convert every page ---------------------------------------------------------------------
const paginas = []
for (const p of PAGINAS) paginas.push(await convertirPagina(p))
const home = paginas[0]
const nombre = a.nombre || home.titulo.split(/\s[·|—–-]\s/)[0].trim() || 'Mi sitio'

// the shared sheets, once
const hojasCompartidas = []
for (const r of COMPARTIDAS) {
  const f = path.join(BUILD, r)
  if (!fs.existsSync(f)) {
    aviso(`La hoja compartida ${r} no existe en el build; se omitió.`)
    continue
  }
  const t = cssSinComentarios(leer(f))
  if ((await normalizar('p.css', leer(f))) !== (await normalizar('p.css', t))) throw new Error(`${r}: quitar comentarios cambió el CSS`)
  hojasCompartidas.push({ r, trozos: partirPorBytes(tokenizar(/(^|[\s,{}])(html\s*>\s*)?body\s*>/.test(t) ? ajustarBody(t) : t), 'p.css') })
}

// ---- the engine ---------------------------------------------------------------------
function motor(archivo) {
  const local = path.join(BUILD, archivo)
  if (fs.existsSync(local)) return leer(local)
  aviso(`${archivo} no está en el build; revisa que las páginas usen el motor de scroll-craft.`)
  return null
}
const motorJs = motor('scrollcraft.js')
const motorCss = motor('scrollcraft.css')

// ---- the images (and videos) to upload ------------------------------------------
const imagenes = []
for (const n of [...assetsUsados].sort()) {
  const f = path.join(BUILD, 'assets', n)
  if (!fs.existsSync(f)) {
    aviso(`assets/${n} se usa en el sitio pero no existe en el build.`)
    continue
  }
  imagenes.push({ clave: n, archivo: f, tipo: /\.(mp4|webm|mov)$/i.test(n) ? 'video' : 'imagen' })
}
const repetidos = imagenes.map((i) => path.basename(i.clave)).filter((b, i, arr) => arr.indexOf(b) !== i)
if (repetidos.length) aviso(`Hay archivos con el mismo nombre en carpetas distintas (${[...new Set(repetidos)].join(', ')}): renómbralos antes de subirlos.`)
if (imagenes.some((i) => i.tipo === 'video')) aviso('El sitio usa video. Falta confirmar que el chat de AI Studio acepte MP4; ver references/reglas-ai-studio.md.')

// ---- the forms, the domain, GTM ------------------------------------------------------------
const todosLosFormularios = paginas.flatMap((pg) => pg.formularios.map((f) => ({ pagina: pg.id, ruta: pg.ruta, ...f })))
const principal = todosLosFormularios[0]?.formId || 'registro'
const formulario = {
  existe: todosLosFormularios.length > 0,
  nombre: principal,
  formId: principal,
  source: principal,
  mediumId: principal,
  formularios: todosLosFormularios,
}
const gtm = a.gtm && typeof a.gtm === 'string' ? a.gtm : null
const dominio = typeof a.dominio === 'string' ? a.dominio.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
if (gtm && !dominio) aviso('Pasaste --gtm sin --dominio: GTM cargará también en la vista previa de AI Studio.')
const dominioRe = dominio ? dominio.replace(/\./g, '\\.') : null
const gtmSnippet = gtm
  ? `(function (w, d, s, l, i) {\n${dominioRe ? `  if (!/(^|\\.)${dominioRe}$/.test(location.hostname)) return;\n` : ''}  w[l] = w[l] || [];\n  w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });\n  var f = d.getElementsByTagName(s)[0], j = d.createElement(s), dl = l != "dataLayer" ? "&l=" + l : "";\n  j.async = true;\n  j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;\n  f.parentNode.insertBefore(j, f);\n})(window, document, "script", "dataLayer", ${JSON.stringify(gtm)});`
  : null
const urlSitio = dominio ? `https://${dominio}/` : null
const urlDe = (pg) => (urlSitio ? (pg.ruta === '/' ? urlSitio : `https://${dominio}${pg.ruta}`) : null)

// ---- write the files ------------------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true })
const archivos = []
const poner = (ruta, contenido, costura = false) => {
  escribir(path.join(OUT, ruta), contenido)
  archivos.push({ ruta, costura })
}
const plantilla = (rel) => leer(path.join(PLANTILLAS, rel))

// shared first: the engine, the shared sheets, the images' map, forms
if (motorJs) {
  const limpio = await jsSinComentarios('scrollcraft.js', motorJs)
  if ((await normalizar('m.js', motorJs)) !== (await normalizar('m.js', limpio))) throw new Error('Quitar comentarios cambió el motor')
  poner('src/lib/scrollcraft.js', limpio)
}
poner('src/lib/scrollcraft.d.ts', plantilla('src/lib/scrollcraft.d.ts'))
if (motorCss) poner('src/lib/scrollcraft.css', cssSinComentarios(motorCss))
const importsHojas = []
hojasCompartidas.forEach((h, k) => {
  const id = segmento(h.r.replace(/\.css$/i, ''))
  h.trozos.forEach((t, i) => {
    poner(`src/components/pagina/compartido-${id}-${num(i)}.ts`, `// ${h.r}, la hoja compartida por las páginas del sitio (parte ${i + 1} de ${h.trozos.length}).\nconst css = ${literal(t)};\nexport default css;\n`)
    importsHojas.push({ imp: `import h${k + 1}p${i + 1} from "./compartido-${id}-${num(i)}";`, r: h.r, v: `h${k + 1}p${i + 1}` })
  })
})
if (hojasCompartidas.length) {
  poner(
    'src/components/pagina/compartido.ts',
    `// Las hojas que comparten las páginas del sitio (sitio.css): colores, fuentes, menú y pie.\n// Van una sola vez; cada página las enlaza en su <head>.\n${importsHojas.map((x) => x.imp).join('\n')}\n\nexport const HOJAS: Record<string, string> = {\n${hojasCompartidas.map((h) => `  ${q(h.r)}: [${importsHojas.filter((x) => x.r === h.r).map((x) => x.v).join(', ')}].join(""),`).join('\n')}\n};\n`,
  )
}
poner(
  'src/components/pagina/image-urls.ts',
  `// URL de cada archivo de assets/ subido por el chat de AI Studio, por su nombre.\n// Mientras una esté vacía, la página no puede mostrar ese archivo.\nexport const IMAGE_URLS: Record<string, string> = {\n${imagenes.map((i) => `  ${JSON.stringify(i.clave)}: "",`).join('\n')}\n};\n`,
  true,
)
poner('src/components/pagina/assets.ts', plantilla('src/components/pagina/assets.ts'))
poner('src/components/pagina/lead.ts', plantilla('src/components/pagina/lead.ts').replace('__FORM_ID__', formulario.formId).replace('__SOURCE__', formulario.source), true)
poner('src/components/pagina/formulario.ts', plantilla('src/components/pagina/formulario.ts'))

// then each page: the home in pagina/ (as it always was), the others in paginas/<id>/
for (const pg of paginas) {
  const dir = pg.esHome ? 'src/components/pagina' : `src/components/paginas/${pg.id}`
  const quien = pg.esHome ? 'la página principal' : `la página ${pg.ruta}`
  pg.trozosCss.forEach((t, i) => poner(`${dir}/css-${num(i)}.ts`, `// CSS de ${quien} (parte ${i + 1} de ${pg.trozosCss.length}).\nconst css = ${literal(t)};\nexport default css;\n`))
  pg.trozosHtml.forEach((t, i) => poner(`${dir}/html-${num(i)}.ts`, `// HTML de ${quien} (parte ${i + 1} de ${pg.trozosHtml.length}). Aquí se editan los textos.\nconst html = ${literal(t)};\nexport default html;\n`))
  const nombresScripts = []
  pg.scriptsPagina.forEach((sc, i) => {
    const partes = sc.partes.map((t, j) => {
      const id = sc.partes.length > 1 ? `${num(i)}_${j + 1}` : num(i)
      poner(
        `${dir}/script-${id.replace('_', '-')}.ts`,
        `// <script> propio de ${quien} (${i + 1} de ${pg.scriptsPagina.length}${sc.partes.length > 1 ? `, parte ${j + 1} de ${sc.partes.length}` : ''}), tal cual.\nconst script = ${literal(t)};\nexport default script;\n`,
      )
      return id
    })
    nombresScripts.push({ partes, modulo: sc.modulo })
  })
  const lineasImport = [
    ...pg.trozosHtml.map((_, i) => `import html${num(i)} from "./html-${num(i)}";`),
    ...pg.trozosCss.map((_, i) => `import css${num(i)} from "./css-${num(i)}";`),
    ...nombresScripts.flatMap((x) => x.partes.map((id) => `import script${id} from "./script-${id.replace('_', '-')}";`)),
  ]
  poner(
    `${dir}/contenido.ts`,
    `// Las piezas de ${quien}, en su orden (generado por convertir-html.mjs).\n// Los textos se editan en html-NN.ts; los estilos, en css-NN.ts.\n${lineasImport.join('\n')}\n\nexport const HTML: string[] = [${pg.trozosHtml.map((_, i) => `html${num(i)}`).join(', ')}];\nexport const CSS: string[] = [${pg.trozosCss.map((_, i) => `css${num(i)}`).join(', ')}];\nexport const SCRIPTS: { codigo: string; modulo: boolean }[] = [${nombresScripts.map((x) => `{ codigo: ${x.partes.map((id) => `script${id}`).join(' + ')}, modulo: ${x.modulo} }`).join(', ')}];\nexport const OPCIONES_MOTOR: Record<string, unknown> | undefined = ${pg.opcionesMotor};\nexport const ATRIBUTOS_BODY: Record<string, string> = ${JSON.stringify(pg.atributosBody)};\n`,
  )
  poner(`${dir}/head.ts`, cabeza(pg))
}

// the page's <head>: what the original page had in its own, plus its SEO
function cabeza(pg) {
  const tiene = (clave) => pg.metas.some((m) => (m.name || m.property) === clave)
  if (!pg.descripcion) aviso(`${pg.rel} no tiene <meta name="description">: usé el título. Escribe una descripción (70 a 160 caracteres) y vuelve a convertir.`)
  const descripcionSeo = pg.descripcion || pg.titulo
  const url = urlDe(pg)
  // The template's root declares author «AI Studio», og:title «AI Studio App» and
  // «AI Studio Generated Project» as description: a page that does not declare its own
  // inherits them. Child meta wins by name/property, so each page declares all of them.
  const metasSeo = [
    ...(!pg.descripcion ? [{ name: 'description', content: descripcionSeo }] : []),
    ...(!tiene('author') ? [{ name: 'author', content: nombre }] : []),
    ...(!tiene('og:title') ? [{ property: 'og:title', content: pg.titulo }] : []),
    ...(!tiene('og:description') ? [{ property: 'og:description', content: descripcionSeo }] : []),
    ...(!tiene('og:site_name') ? [{ property: 'og:site_name', content: nombre }] : []),
    ...(url && !tiene('og:url') ? [{ property: 'og:url', content: url }] : []),
    ...(!tiene('twitter:title') ? [{ name: 'twitter:title', content: pg.titulo }] : []),
    ...(!tiene('twitter:description') ? [{ name: 'twitter:description', content: descripcionSeo }] : []),
  ]
  // with a domain, the home carries the site's structured data (unless it brings its own)
  const traeJsonLd = pg.scriptsHead.some((x) => /ld\+json/i.test(x.tipo || ''))
  const jsonLd =
    url && pg.esHome && !traeJsonLd
      ? JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', '@id': `${url}#sitio`, name: nombre, url, inLanguage: pg.lang, description: descripcionSeo },
            { '@type': 'Organization', '@id': `${url}#organizacion`, name: nombre, url },
          ],
        }).replace(/</g, '\\u003c')
      : null
  const headScripts = [
    ...(gtmSnippet ? [`{ children: ${literal(gtmSnippet)} }`] : []),
    ...(jsonLd ? [`{ type: "application/ld+json", children: ${JSON.stringify(jsonLd)} }`] : []),
    ...pg.scriptsHead.map((s) => {
      const extra = `${s.tipo ? `, type: ${JSON.stringify(s.tipo)}` : ''}${s.async ? ', async: true' : ''}${s.defer ? ', defer: true' : ''}`
      return s.src ? `{ src: ${JSON.stringify(s.src)}${extra} }` : `{ children: ${literal(tokenizar(s.codigo))}${extra} }`
    }),
  ]
  const usaAsset = pg.icono?.asset || pg.metas.some((m) => /^(?:\.\/|\/|(?:\.\.\/)+)?assets\//.test(m.content))
  const base = pg.esHome ? './' : '@/components/pagina/'
  const contenidoMeta = (c) => {
    // og:image and friends pointing to assets/ resolve to the uploaded URL
    const m = c.match(/^(?:\.\/|\/|(?:\.\.\/)+)?assets\/(.+)$/)
    return m ? `asset(${q(m[1])})` : q(c)
  }
  const estilos = [
    '{ children: SIN_PREFLIGHT }',
    ...pg.hojas.map((r) => `{ children: resolver(HOJAS[${q(r)}] ?? "") }`),
    '{ children: estilos }',
  ]
  return `// El <head> de ${pg.esHome ? 'la página principal' : `la página ${pg.ruta}`}: título, descripción, redes, fuentes, la hoja
// del motor de scroll y la de la página (sus partes están en css-NN.ts).
${motorCss ? 'import scrollcraftCss from "@/lib/scrollcraft.css?url";\n' : ''}import { ${usaAsset ? 'asset, ' : ''}resolver } from "${base}assets";
${pg.hojas.length ? `import { HOJAS } from "${base}compartido";\n` : ''}import { CSS } from "./contenido";

export const TITULO = ${q(pg.titulo)};
export const DESCRIPCION = ${q(pg.descripcion)};
// La hoja propia de la página, en el <head> después de la del motor, como en el original.
const estilos = resolver(CSS.join(""));
// El Tailwind de la plantilla reinicia todos los elementos (su «preflight», en @layer base):
// quita márgenes de p y figure, viñetas de listas, negritas de h3… La página original no lo
// tenía, así que en esta ruta esa capa se deshace.
const SIN_PREFLIGHT =
  "@layer base { html, html *, html ::before, html ::after, html ::backdrop, html ::marker, html ::placeholder, html ::file-selector-button { all: revert-layer; } }";

export const paginaHead = () => ({
  meta: [
    { title: TITULO },
${[...pg.metas, ...metasSeo].map((m) => `    { ${m.property ? `property: ${q(m.property)}` : `name: ${q(m.name)}`}, content: ${contenidoMeta(m.content)} },`).join('\n')}
  ],
  links: [
${url ? `    { rel: "canonical", href: ${q(url)} },\n` : ''}${pg.links.map((l) => `    { rel: ${q(l.rel)}, href: ${q(l.href)}${l.crossOrigin ? ', crossOrigin: "anonymous" as const' : ''} },`).join('\n')}
${motorCss ? '    { rel: "stylesheet", href: scrollcraftCss },\n' : ''}${pg.icono ? `    { rel: "icon", href: ${pg.icono.asset ? `asset(${q(pg.icono.asset)})` : q(pg.icono.href)} },\n` : ''}  ],
  styles: [${estilos.join(', ')}],${headScripts.length ? `\n  scripts: [\n${headScripts.map((s) => `    ${s},`).join('\n')}\n  ],` : ''}
});
`
}

// the domain's robots.txt and a sitemap with every page
const zip = await abrirZip(path.resolve(a.plantilla))
if (urlSitio) {
  const robots = (zip.leer('public/robots.txt') || 'User-agent: *\nAllow: /\n').replace(/\s*$/, '\n')
  poner('public/robots.txt', /^\s*sitemap:/im.test(robots) ? robots : `${robots}\nSitemap: ${urlSitio}sitemap.xml\n`)
  poner('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paginas.map((pg) => `  <url>\n    <loc>${urlDe(pg)}</loc>\n  </url>\n`).join('')}</urlset>\n`)
}

// the renderer, then the routes (last, so nothing compiles half-done), then the root
poner('src/components/pagina/Pagina.tsx', plantilla('src/components/pagina/Pagina.tsx'))
poner('src/routes/index.tsx', plantilla('src/routes/index.tsx'))
for (const pg of paginas.filter((x) => !x.esHome)) {
  // /servicios with /servicios/web below it: a flat servicios.tsx would become the layout of
  // web.tsx (and hide it), so a page with children lives in servicios/index.tsx
  const tieneHijas = paginas.some((x) => x.ruta.startsWith(`${pg.ruta}/`))
  const archivoRuta = tieneHijas ? `src/routes${pg.ruta}/index.tsx` : `src/routes${pg.ruta}.tsx`
  const idRuta = tieneHijas ? `${pg.ruta}/` : pg.ruta
  poner(
    archivoRuta,
    `import { createFileRoute } from "@tanstack/react-router";\nimport { crearPagina } from "@/components/pagina/Pagina";\nimport * as contenido from "@/components/paginas/${pg.id}/contenido";\nimport { paginaHead } from "@/components/paginas/${pg.id}/head";\n\nconst Pagina = crearPagina(contenido);\n\nexport const Route = createFileRoute(${q(idRuta)})({\n  head: paginaHead,\n  component: Pagina,\n});\n`,
  )
}
// the template's own root, with only the language and the safe area changed
let root = zip.leer('src/routes/__root.tsx')
if (root) {
  const antes = root
  root = root.replace(/<html lang="[a-zA-Z-]*"/, `<html lang="${home.lang}"`)
  if (home.cover) root = root.replace(/(content:\s*"width=device-width, initial-scale=1)(")/, '$1, viewport-fit=cover$2')
  if (root !== antes) poner('src/routes/__root.tsx', root)
  else aviso('No cambié el root de la plantilla (no encontré su lang ni su viewport).')
} else aviso('La plantilla no trae src/routes/__root.tsx: revisa que el ZIP sea de un proyecto de AI Studio.')

// ---- manifest -------------------------------------------------------------------------
const manifiesto = {
  generado: new Date().toISOString(),
  proyecto: nombre,
  origen: { build: BUILD, html: home.archivo },
  plantilla: path.resolve(a.plantilla),
  tipo: 'html-scroll-craft',
  meta: { titulo: home.titulo, descripcion: home.descripcion, lang: home.lang },
  paginas: paginas.map((pg) => ({ id: pg.id, ruta: pg.ruta, rel: pg.rel, archivo: pg.archivo, titulo: pg.titulo, descripcion: pg.descripcion, formularios: pg.formularios.map((f) => f.formId) })),
  archivos,
  imagenes,
  formulario,
  gtm: gtm ? { id: gtm, dominio } : null,
  seo: { dominio, url: urlSitio },
  avisos,
}
escribir(path.join(ESPACIO, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2) + '\n')
console.log(`\n${archivos.length} archivos en ${path.relative(process.cwd(), OUT) || OUT}`)
console.log(`  ${paginas.length} página(s): ${paginas.map((pg) => pg.ruta).join(' · ')}`)
if (hojasCompartidas.length) console.log(`  hojas compartidas: ${hojasCompartidas.map((h) => h.r).join(', ')}`)
console.log(`  ${imagenes.length} archivo(s) de assets para subir${formulario.existe ? `, ${todosLosFormularios.length} formulario(s): ${todosLosFormularios.map((f) => f.formId).join(', ')}` : ', sin formularios'}`)
if (avisos.length) console.log(`  ${avisos.length} aviso(s): revisa manifiesto.json`)
