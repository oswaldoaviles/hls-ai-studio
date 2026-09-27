#!/usr/bin/env node
// Turns a scroll-craft HTML build into the files of an AI Studio project
// (TanStack Start), keeping the page exactly as it is: the markup goes in as
// text (not translated to JSX), the scroll engine mounts on load, the page's own
// CSS and <script>s keep their order, every assets/ reference becomes a token
// resolved against the URLs the chat gives when the files are uploaded, and
// forms are wired to AI Studio's own CRM connection.
//
//   cd <workspace>                     (made by doctor.mjs --preparar)
//   node <skill>/scripts/convertir-html.mjs <build> --plantilla <blank-project.zip>
//        [--form-id <id>] [--html index.html] [--nombre "Mi sitio"]
//        [--gtm GTM-XXXX --dominio midominio.com]
//
// Writes archivos/ (the files, at their paths in the project) and manifiesto.json
// (their order, the images to upload, the form, warnings) in the workspace.
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
const HTML_FILE = path.join(BUILD, a.html || 'index.html')
const PLANTILLAS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates')
const OUT = path.join(ESPACIO, 'archivos')
const avisos = []
const aviso = (m) => {
  avisos.push(m)
  console.log(`  ! ${m}`)
}

const parse5 = await cargar('parse5')
const src = leer(HTML_FILE)
const doc = parse5.parse(src, { sourceCodeLocationInfo: true })

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
const htmlEl = hijos(doc).find((n) => n.tagName === 'html')
const head = hijos(htmlEl).find((n) => n.tagName === 'head')
const body = hijos(htmlEl).find((n) => n.tagName === 'body')
const esLocal = (u) => u && !/^(https?:)?\/\//.test(u) && !u.startsWith('data:')
const esMotor = (u) => /(^|\/)scrollcraft\.(js|css)$/.test(u || '')

// ---- assets: every relative assets/ reference becomes @@asset:<name>@@ --------
const assetsUsados = new Set()
function tokenizar(t) {
  return t
    .replace(/url\(\s*(['"]?)(?:\.\/|\/)?assets\/([^'")\s?#]+)[^'")\s]*\1\s*\)/g, (_m, q, n) => {
      assetsUsados.add(n)
      return `url(${q}@@asset:${n}@@${q})`
    })
    .replace(/(^|["'\s,=(])(?:\.\/|\/)?assets\/([^"'\s,)?#<>]+)/g, (_m, pre, n) => {
      assetsUsados.add(n)
      return `${pre}@@asset:${n}@@`
    })
}

// ---- head -------------------------------------------------------------------------
const lang = attr(htmlEl, 'lang') || 'es'
const metaTags = head ? hijos(head).filter((n) => n.tagName === 'meta') : []
const viewport = metaTags.find((m) => attr(m, 'name') === 'viewport')
const cover = /viewport-fit\s*=\s*cover/.test(attr(viewport || {}, 'content') || '')
const titulo = (head && hijos(head).find((n) => n.tagName === 'title') && texto(hijos(head).find((n) => n.tagName === 'title')).trim()) || 'Mi sitio'
const metas = metaTags
  .filter((m) => (attr(m, 'name') && !['viewport', 'theme-color-scheme'].includes(attr(m, 'name'))) || attr(m, 'property'))
  .map((m) => (attr(m, 'property') ? { property: attr(m, 'property'), content: attr(m, 'content') || '' } : { name: attr(m, 'name'), content: attr(m, 'content') || '' }))
const descripcion = metas.find((m) => m.name === 'description')?.content || ''
// og:image and friends pointing to assets/ are uploaded too, and resolve to their URL
const usaAssetEnMeta = metas.some((m) => /^(?:\.\/|\/)?assets\//.test(m.content))
for (const m of metas) {
  const x = m.content.match(/^(?:\.\/|\/)?assets\/(.+)$/)
  if (x) assetsUsados.add(x[1])
}
const links = []
let css = ''
let icono = null
const scriptsHead = []
for (const n of head ? hijos(head) : []) {
  if (n.tagName === 'link') {
    const rel = (attr(n, 'rel') || '').toLowerCase()
    const href = attr(n, 'href') || ''
    if (rel.includes('stylesheet')) {
      if (esMotor(href)) continue
      if (esLocal(href)) {
        const f = path.join(BUILD, href.replace(/^\.?\//, ''))
        if (fs.existsSync(f)) css += `\n/* ${href} */\n` + leer(f)
        else aviso(`La hoja ${href} no existe en el build; se omitió.`)
      } else links.push({ rel: 'stylesheet', href })
    } else if (rel.includes('preconnect') || rel.includes('dns-prefetch')) {
      links.push({ rel, href, ...(attr(n, 'crossorigin') !== undefined ? { crossOrigin: 'anonymous' } : {}) })
    } else if (rel.includes('icon')) {
      icono = esLocal(href) ? { asset: tokenizar(href).replace(/^@@asset:|@@$/g, '') } : { href }
    }
  } else if (n.tagName === 'style') {
    css += '\n' + texto(n)
  } else if (n.tagName === 'script') {
    const s = attr(n, 'src')
    if (s && esMotor(s)) continue
    const extra = atributosScript(n)
    if (s && esLocal(s)) scriptsHead.push({ codigo: leer(path.join(BUILD, s.replace(/^\.?\//, ''))), ...extra })
    else if (s) scriptsHead.push({ src: s, ...extra })
    else if (texto(n).trim()) scriptsHead.push({ codigo: texto(n), ...extra })
  }
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

// ---- body: the markup as it is, minus <script>s, with forms marked ----------
const loc = body.sourceCodeLocation
const bodyIni = loc?.startTag ? loc.startTag.endOffset : head?.sourceCodeLocation?.endOffset ?? 0
const bodyFin = loc?.endTag ? loc.endTag.startOffset : src.length
const ATRIBUTOS_BODY = Object.fromEntries((body.attrs || []).map((x) => [x.name, x.value]))

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
    scriptsBody.push({ codigo: leer(path.join(BUILD, sSrc.replace(/^\.?\//, ''))), modulo })
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
  const montaje = codigo.match(/ScrollCraft\.mount\(\s*document\.body\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)\s*;?/)
  if (montaje) {
    if (montaje[1]) opcionesMotor = montaje[1]
    codigo = codigo.replace(montaje[0], '')
  }
  if (codigo.trim()) scriptsBody.push({ codigo, modulo })
}
// links to other pages of the build do not exist in AI Studio (only / is migrated)
const otrasPaginas = [...new Set(todos(body, (n) => n.tagName === 'a' && /^(?!https?:|\/\/|#|mailto:|tel:)[^?#]*\.html?([?#]|$)/i.test(attr(n, 'href') || '')).map((n) => attr(n, 'href')))]
if (otrasPaginas.length) aviso(`La página enlaza a otras páginas del build (${otrasPaginas.join(', ')}): esas no se migran. Cambia esos enlaces por URLs completas o migra cada página aparte.`)
const formularios = todos(body, (n) => n.tagName === 'form')
for (const f of formularios) ediciones.push([f.sourceCodeLocation.startTag.startOffset + 5, 0, ' data-ai-studio-form'])
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
const LIMITE_TROZO = 9 * 1024
function cortes(n) {
  const out = []
  for (const c of hijos(n)) {
    if (c.tagName === 'script') continue
    const l = c.sourceCodeLocation
    const tam = l.endOffset - l.startOffset
    if (tam > LIMITE_TROZO && hijos(c).some((h) => h.tagName !== 'script')) {
      out.push(nuevo(l.startOffset) - base)
      out.push(...cortes(c))
    } else out.push(nuevo(l.startOffset) - base)
  }
  return out
}
const puntos = [...new Set([0, ...cortes(body)])].sort((x, y) => x - y).filter((p) => p >= 0 && p < cuerpo.length)
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
if (trozosHtml.join('') !== cuerpo) throw new Error('Los trozos del HTML no reconstruyen el cuerpo')
// chunks start at elements, so no assets/ reference is cut in two
for (let i = 0; i < trozosHtml.length; i++) trozosHtml[i] = tokenizar(trozosHtml[i])
const grandes = trozosHtml.filter((t) => lineas(t) > LIMITE_LINEAS || Buffer.byteLength(t) > 11 * 1024)
if (grandes.length) aviso(`${grandes.length} bloque(s) de HTML no se pudieron partir por debajo del límite (un elemento enorme sin hijos); revisa html-NN.ts.`)

// ---- CSS ----------------------------------------------------------------------------
const cssLimpio = cssSinComentarios(css)
if ((await normalizar('p.css', css)) !== (await normalizar('p.css', cssLimpio))) throw new Error('Quitar comentarios cambió el CSS')
let cssFinal = cssLimpio
if (/(^|[\s,{}])(html\s*>\s*)?body\s*>/.test(cssFinal)) {
  cssFinal = cssFinal.replace(/(^|[\s,{}])(html\s*>\s*)?body\s*>\s*/g, '$1$2body > .ai-pagina > ')
  aviso('El CSS usaba "body > …"; se ajustó a "body > .ai-pagina > …" (la página vive dentro de un contenedor).')
}
cssFinal = tokenizar(cssFinal)
const trozosCss = partirPorBytes(cssFinal, 'p.css')

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

// ---- scripts: a big one is split in parts that are joined back into one --------
const scriptsPagina = scriptsBody.map((x) => ({ modulo: x.modulo, partes: partirPorBytes(tokenizar(x.codigo), 'p.js') }))
for (const s of scriptsHead) if (s.codigo && /googletagmanager\.com\/gtm\.js/.test(s.codigo)) aviso('La página ya trae un snippet de Google Tag Manager; se mantiene en el <head> tal cual (no pases --gtm).')

// ---- the engine ---------------------------------------------------------------------
function motor(nombre) {
  const local = path.join(BUILD, nombre)
  if (fs.existsSync(local)) return leer(local)
  aviso(`${nombre} no está en el build; revisa que la página use el motor de scroll-craft.`)
  return null
}
const motorJs = motor('scrollcraft.js')
const motorCss = motor('scrollcraft.css')

// ---- the images (and videos) to upload ------------------------------------------
const imagenes = []
for (const n of [...assetsUsados].sort()) {
  const f = path.join(BUILD, 'assets', n)
  if (!fs.existsSync(f)) {
    aviso(`assets/${n} se usa en la página pero no existe en el build.`)
    continue
  }
  imagenes.push({ clave: n, archivo: f, tipo: /\.(mp4|webm|mov)$/i.test(n) ? 'video' : 'imagen' })
}
const repetidos = imagenes.map((i) => path.basename(i.clave)).filter((b, i, arr) => arr.indexOf(b) !== i)
if (repetidos.length) aviso(`Hay archivos con el mismo nombre en carpetas distintas (${[...new Set(repetidos)].join(', ')}): renómbralos antes de subirlos.`)
if (imagenes.some((i) => i.tipo === 'video')) aviso('La página usa video. Falta confirmar que el chat de AI Studio acepte MP4; ver references/reglas-ai-studio.md.')

// ---- the form's identity in the CRM ---------------------------------------------
const nombre = a.nombre || titulo.split(/\s[·|—–-]\s/)[0].trim() || 'Mi sitio'
const campos = formularios.map((f) => ({
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
// one generic, evergreen ID unless the student gives one: it is also the form's name in
// the CRM, the contact's source and the medium
const formId = typeof a['form-id'] === 'string' && a['form-id'].trim() ? a['form-id'].trim() : 'registro'
const formulario = {
  existe: formularios.length > 0,
  nombre: formId,
  formId,
  source: formId,
  mediumId: formId,
  formularios: campos,
}

// ---- write the files ----------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true })
const archivos = []
const poner = (ruta, contenido, costura = false) => {
  escribir(path.join(OUT, ruta), contenido)
  archivos.push({ ruta, costura })
}
const plantilla = (rel) => leer(path.join(PLANTILLAS, rel))
const num = (i) => String(i + 1).padStart(2, '0')

if (motorJs) {
  const limpio = await jsSinComentarios('scrollcraft.js', motorJs)
  if ((await normalizar('m.js', motorJs)) !== (await normalizar('m.js', limpio))) throw new Error('Quitar comentarios cambió el motor')
  poner('src/lib/scrollcraft.js', limpio)
}
poner('src/lib/scrollcraft.d.ts', plantilla('src/lib/scrollcraft.d.ts'))
if (motorCss) poner('src/lib/scrollcraft.css', cssSinComentarios(motorCss))

trozosCss.forEach((t, i) => poner(`src/components/pagina/css-${num(i)}.ts`, `// CSS de la página original (parte ${i + 1} de ${trozosCss.length}).\nconst css = ${literal(t)};\nexport default css;\n`))
trozosHtml.forEach((t, i) => poner(`src/components/pagina/html-${num(i)}.ts`, `// HTML de la página original (parte ${i + 1} de ${trozosHtml.length}). Aquí se editan los textos.\nconst html = ${literal(t)};\nexport default html;\n`))
const nombresScripts = []
scriptsPagina.forEach((sc, i) => {
  const partes = sc.partes.map((t, j) => {
    const id = sc.partes.length > 1 ? `${num(i)}_${j + 1}` : num(i)
    poner(
      `src/components/pagina/script-${id.replace('_', '-')}.ts`,
      `// <script> propio de la página original (${i + 1} de ${scriptsPagina.length}${sc.partes.length > 1 ? `, parte ${j + 1} de ${sc.partes.length}` : ''}), tal cual.\nconst script = ${literal(t)};\nexport default script;\n`,
    )
    return id
  })
  nombresScripts.push({ partes, modulo: sc.modulo })
})

poner(
  'src/components/pagina/image-urls.ts',
  `// URL de cada archivo de assets/ subido por el chat de AI Studio, por su nombre.\n// Mientras una esté vacía, la página no puede mostrar ese archivo.\nexport const IMAGE_URLS: Record<string, string> = {\n${imagenes.map((i) => `  ${JSON.stringify(i.clave)}: "",`).join('\n')}\n};\n`,
  true,
)
poner('src/components/pagina/assets.ts', plantilla('src/components/pagina/assets.ts'))
poner('src/components/pagina/lead.ts', plantilla('src/components/pagina/lead.ts').replace('__FORM_ID__', formulario.formId).replace('__SOURCE__', formulario.source), true)
poner('src/components/pagina/formulario.ts', plantilla('src/components/pagina/formulario.ts'))

const lineasImport = [
  ...trozosHtml.map((_, i) => `import html${num(i)} from "./html-${num(i)}";`),
  ...trozosCss.map((_, i) => `import css${num(i)} from "./css-${num(i)}";`),
  ...nombresScripts.flatMap((x) => x.partes.map((id) => `import script${id} from "./script-${id.replace('_', '-')}";`)),
]
poner(
  'src/components/pagina/contenido.ts',
  `// Las piezas de la página original, en su orden (generado por convertir-html.mjs).\n// Los textos se editan en html-NN.ts; los estilos, en css-NN.ts.\n${lineasImport.join('\n')}\n\nexport const HTML: string[] = [${trozosHtml.map((_, i) => `html${num(i)}`).join(', ')}];\nexport const CSS: string[] = [${trozosCss.map((_, i) => `css${num(i)}`).join(', ')}];\nexport const SCRIPTS: { codigo: string; modulo: boolean }[] = [${nombresScripts.map((x) => `{ codigo: ${x.partes.map((id) => `script${id}`).join(' + ')}, modulo: ${x.modulo} }`).join(', ')}];\nexport const OPCIONES_MOTOR: Record<string, unknown> | undefined = ${opcionesMotor};\nexport const ATRIBUTOS_BODY: Record<string, string> = ${JSON.stringify(ATRIBUTOS_BODY)};\n`,
)

// the route's <head>: what the original page had in its own
const gtm = a.gtm && typeof a.gtm === 'string' ? a.gtm : null
const dominio = typeof a.dominio === 'string' ? a.dominio.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
if (gtm && !dominio) aviso('Pasaste --gtm sin --dominio: GTM cargará también en la vista previa de AI Studio.')
const dominioRe = dominio ? dominio.replace(/\./g, '\\.') : null
const gtmSnippet = gtm
  ? `(function (w, d, s, l, i) {\n${dominioRe ? `  if (!/(^|\\.)${dominioRe}$/.test(location.hostname)) return;\n` : ''}  w[l] = w[l] || [];\n  w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });\n  var f = d.getElementsByTagName(s)[0], j = d.createElement(s), dl = l != "dataLayer" ? "&l=" + l : "";\n  j.async = true;\n  j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;\n  f.parentNode.insertBefore(j, f);\n})(window, document, "script", "dataLayer", ${JSON.stringify(gtm)});`
  : null
const headScripts = [
  ...(gtmSnippet ? [`{ children: ${literal(gtmSnippet)} }`] : []),
  ...scriptsHead.map((s) => {
    const extra = `${s.tipo ? `, type: ${JSON.stringify(s.tipo)}` : ''}${s.async ? ', async: true' : ''}${s.defer ? ', defer: true' : ''}`
    return s.src ? `{ src: ${JSON.stringify(s.src)}${extra} }` : `{ children: ${literal(tokenizar(s.codigo))}${extra} }`
  }),
]
const q = JSON.stringify
poner(
  'src/components/pagina/head.ts',
  `// El <head> de la página original: título, descripción, redes, fuentes, la hoja\n// del motor de scroll y la de la página (sus partes están en css-NN.ts).\n${motorCss ? 'import scrollcraftCss from "@/lib/scrollcraft.css?url";\n' : ''}import { ${icono?.asset || usaAssetEnMeta ? 'asset, ' : ''}resolver } from "./assets";\nimport { CSS } from "./contenido";\n\nexport const TITULO = ${q(titulo)};\nexport const DESCRIPCION = ${q(descripcion)};\n// La hoja propia de la página, en el <head> después de la del motor, como en el original.\nconst estilos = resolver(CSS.join(""));\n// El Tailwind de la plantilla reinicia todos los elementos (su «preflight», en @layer base):\n// quita márgenes de p y figure, viñetas de listas, negritas de h3… La página original no lo\n// tenía, así que en esta ruta esa capa se deshace.\nconst SIN_PREFLIGHT =\n  "@layer base { html, html *, html ::before, html ::after, html ::backdrop, html ::marker, html ::placeholder, html ::file-selector-button { all: revert-layer; } }";\n\nexport const paginaHead = () => ({\n  meta: [\n    { title: TITULO },\n${metas.map((m) => `    { ${m.property ? `property: ${q(m.property)}` : `name: ${q(m.name)}`}, content: ${contenidoMeta(m.content)} },`).join('\n')}\n  ],\n  links: [\n${links.map((l) => `    { rel: ${q(l.rel)}, href: ${q(l.href)}${l.crossOrigin ? ', crossOrigin: "anonymous" as const' : ''} },`).join('\n')}\n${motorCss ? '    { rel: "stylesheet", href: scrollcraftCss },\n' : ''}${icono ? `    { rel: "icon", href: ${icono.asset ? `asset(${q(icono.asset)})` : q(icono.href)} },\n` : ''}  ],\n  styles: [{ children: SIN_PREFLIGHT }, { children: estilos }],${headScripts.length ? `\n  scripts: [\n${headScripts.map((s) => `    ${s},`).join('\n')}\n  ],` : ''}\n});\n`,
)
function contenidoMeta(c) {
  // og:image and friends pointing to assets/ resolve to the uploaded URL
  const m = c.match(/^(?:\.\/|\/)?assets\/(.+)$/)
  return m ? `asset(${q(m[1])})` : q(c)
}

poner('src/components/pagina/Pagina.tsx', plantilla('src/components/pagina/Pagina.tsx'))
poner('src/routes/index.tsx', plantilla('src/routes/index.tsx'))

// the template's own root, with only the language and the safe area changed
const zip = await abrirZip(path.resolve(a.plantilla))
let root = zip.leer('src/routes/__root.tsx')
if (root) {
  const antes = root
  root = root.replace(/<html lang="[a-zA-Z-]*"/, `<html lang="${lang}"`)
  if (cover) root = root.replace(/(content:\s*"width=device-width, initial-scale=1)(")/, '$1, viewport-fit=cover$2')
  if (root !== antes) poner('src/routes/__root.tsx', root)
  else aviso('No cambié el root de la plantilla (no encontré su lang ni su viewport).')
} else aviso('La plantilla no trae src/routes/__root.tsx: revisa que el ZIP sea de un proyecto de AI Studio.')

// ---- manifest -------------------------------------------------------------------------
const manifiesto = {
  generado: new Date().toISOString(),
  proyecto: nombre,
  origen: { build: BUILD, html: HTML_FILE },
  plantilla: path.resolve(a.plantilla),
  tipo: 'html-scroll-craft',
  meta: { titulo, descripcion, lang },
  archivos,
  imagenes,
  formulario,
  gtm: gtm ? { id: gtm, dominio } : null,
  avisos,
}
escribir(path.join(ESPACIO, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2) + '\n')
console.log(`\n${archivos.length} archivos en ${path.relative(process.cwd(), OUT) || OUT}`)
console.log(`  HTML en ${trozosHtml.length} parte(s), CSS en ${trozosCss.length}, ${scriptsPagina.length} script(s) propio(s)`)
console.log(`  ${imagenes.length} archivo(s) de assets para subir${formulario.existe ? `, ${formularios.length} formulario(s)` : ', sin formularios'}`)
if (avisos.length) console.log(`  ${avisos.length} aviso(s): revisa manifiesto.json`)
