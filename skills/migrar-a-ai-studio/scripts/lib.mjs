// Helpers shared by the migration scripts.
//
// The scripts live in the plugin, but their dependencies (vite, lightningcss,
// prettier, parse5, adm-zip, playwright-core) are installed in the student's
// migration workspace by `doctor.mjs --preparar` and loaded from there. The
// workspace is the current directory, or HLS_ESPACIO.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const ESPACIO = path.resolve(process.env.HLS_ESPACIO || process.cwd())

// AI Studio limits, learned on a real migration (references/reglas-ai-studio.md)
export const LIMITE_MENSAJE = 12 * 1024 // bytes per chat message
export const LIMITE_LINEAS = 350 // lines per generated file
export const ADJUNTOS_POR_MENSAJE = 5

/** Imports a package installed in the workspace, whatever its module format. */
export async function cargar(nombre, dir = ESPACIO) {
  const base = path.join(dir, 'node_modules', ...nombre.split('/'))
  const pj = path.join(base, 'package.json')
  if (!fs.existsSync(pj)) {
    throw new Error(
      `Falta "${nombre}" en ${dir}. Prepara el espacio de trabajo: node <skill>/scripts/doctor.mjs --preparar`,
    )
  }
  const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'))
  const pick = (e) =>
    typeof e === 'string' ? e : e && (pick(e.import) || pick(e.node) || pick(e.default) || pick(e.require))
  const exp = pkg.exports && (typeof pkg.exports === 'string' || pkg.exports.import ? pkg.exports : pkg.exports['.'])
  const entry = pick(exp) || pkg.module || pkg.main || 'index.js'
  const mod = await import(pathToFileURL(path.join(base, entry)).href)
  // a CommonJS package: its module.exports (Node 23+ also lists it by that name)
  const cjs = mod.default && (Object.keys(mod).length === 1 || 'module.exports' in mod)
  return cjs ? mod.default : mod
}

export const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
export const leer = (f) => fs.readFileSync(f, 'utf8')
export function escribir(f, texto) {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, texto)
}
export const lineas = (t) => t.split('\n').length - (t.endsWith('\n') ? 1 : 0)

/** A ZIP exported from AI Studio (a single top folder with the project). */
export async function abrirZip(archivo) {
  const AdmZip = await cargar('adm-zip')
  const zip = new AdmZip(archivo)
  const entradas = zip.getEntries().filter((e) => !e.isDirectory)
  const nombres = entradas.map((e) => e.entryName)
  const raiz = nombres.find((n) => /(^|\/)package\.json$/.test(n) && !n.includes('node_modules/'))
  const prefijo = raiz ? raiz.replace(/package\.json$/, '') : ''
  const buscar = (rel) => entradas.find((e) => e.entryName === prefijo + rel)
  return {
    prefijo,
    archivos: nombres.filter((n) => n.startsWith(prefijo)).map((n) => n.slice(prefijo.length)),
    leer: (rel) => {
      const e = buscar(rel)
      return e ? e.getData().toString('utf8') : null
    },
    extraer: (destino) => {
      for (const e of entradas) {
        if (!e.entryName.startsWith(prefijo)) continue
        const f = path.join(destino, e.entryName.slice(prefijo.length))
        fs.mkdirSync(path.dirname(f), { recursive: true })
        fs.writeFileSync(f, e.getData())
      }
    },
  }
}

/** The template's own Prettier settings (fallback: the ones AI Studio ships). */
export function prettierDe(zip) {
  const base = { printWidth: 100, semi: true, singleQuote: false, trailingComma: 'all' }
  const txt = zip && zip.leer('.prettierrc')
  if (!txt) return base
  try {
    return { ...base, ...JSON.parse(txt) }
  } catch {
    return base
  }
}

export async function formatear(archivo, texto, config) {
  const prettier = await cargar('prettier')
  const parser = /\.tsx?$/.test(archivo) ? 'typescript' : /\.css$/.test(archivo) ? 'css' : /\.m?js$/.test(archivo) ? 'babel' : null
  if (!parser) return texto
  return prettier.format(texto, { ...config, parser, filepath: archivo })
}

/** Same program, whatever the formatting: comments, whitespace, quotes, empty
    statements and parentheses do not count. */
export async function normalizar(archivo, texto) {
  if (/\.css$/.test(archivo)) {
    const { transform } = await cargar('lightningcss')
    return transform({ filename: archivo, code: Buffer.from(texto), minify: true }).code.toString()
  }
  if (!/\.(m?js|tsx?)$/.test(archivo)) return texto.replace(/\s+/g, ' ').trim()
  const vite = await cargar('vite')
  let code = texto
  if (/\.tsx?$/.test(archivo)) {
    code = (await vite.transformWithOxc(code, archivo, { lang: archivo.endsWith('.tsx') ? 'tsx' : 'ts', jsx: { runtime: 'automatic' } })).code
  }
  const r = await vite.minify(archivo.replace(/\.tsx?$/, '.js'), code, { compress: true, mangle: false })
  if (r.errors.length) throw new Error(`${archivo}: ${r.errors[0].message}`)
  return r.code
}

/** Engine JS without its comments (same code, still readable, still line-based). */
export async function jsSinComentarios(archivo, texto) {
  const vite = await cargar('vite')
  const r = await vite.minify(archivo, texto, { compress: false, mangle: false, codegen: { removeWhitespace: false } })
  if (r.errors.length) throw new Error(`${archivo}: ${r.errors[0].message}`)
  return r.code.endsWith('\n') ? r.code : r.code + '\n'
}

/** CSS without comments, rules untouched. Left as is when a quoted string holds
    "/*" (a data: URI, say), where a regex could cut into it. */
export function cssSinComentarios(texto) {
  const strings = texto.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g) || []
  if (strings.some((s) => s.includes('/*'))) return texto
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
}

/** Splits a file into parts of at most LIMITE_MENSAJE bytes, only at line ends
    that are safe to glue back (blank lines, closing braces, never inside a
    template literal). Joining the parts gives the file back, byte for byte. */
export function partir(texto, archivo, limite = LIMITE_MENSAJE - 1200) {
  if (Buffer.byteLength(texto) <= limite) return [texto]
  const ls = texto.split('\n')
  const partes = []
  let inicio = 0
  let tam = 0
  let comillas = 0
  let seguro = -1
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]
    tam += Buffer.byteLength(l) + 1
    comillas += (l.match(/`/g) || []).length
    const t = l.trimEnd()
    const ok = comillas % 2 === 0 && (t === '' || /^\s*[})\]][;,)]*$/.test(t) || (/\.css$/.test(archivo) && /\}\s*$/.test(t)))
    if (ok) seguro = i
    if (tam > limite && seguro >= inicio) {
      partes.push(ls.slice(inicio, seguro + 1).join('\n') + '\n')
      inicio = seguro + 1
      tam = ls.slice(inicio, i + 1).reduce((a, x) => a + Buffer.byteLength(x) + 1, 0)
      seguro = -1
    }
  }
  const resto = ls.slice(inicio).join('\n')
  if (resto.trim()) partes.push(resto)
  if (partes.join('') !== texto) throw new Error(`${archivo}: las partes no reconstruyen el archivo`)
  return partes
}

// ---- SEO ------------------------------------------------------------------------------------
// What the blank template's root declares; a page that does not declare its own inherits it.
const GENERICOS = ['AI Studio', 'AI Studio App', 'AI Studio Generated Project']
const sinEntidades = (t) =>
  t.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** SEO of a page as a crawler first gets it: the server's HTML, before any script runs.
    `url` is the page's final address (its domain), when it has one. Returns
    [{ nivel: 'error' | 'nota' | 'ok', texto }]. */
export function auditarHtml(html, { url = null } = {}) {
  const r = []
  const add = (nivel, texto) => r.push({ nivel, texto })
  const metas = {}
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const clave = (m[0].match(/\b(?:name|property)="([^"]+)"/i) || [])[1]
    const valor = (m[0].match(/\bcontent="([^"]*)"/i) || [])[1]
    if (clave && valor !== undefined) metas[clave.toLowerCase()] = sinEntidades(valor)
  }
  const titulo = sinEntidades(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim())
  const heredados = Object.entries(metas).filter(([k, v]) => /^(author|description|og:|twitter:)/.test(k) && GENERICOS.includes(v))
  if (GENERICOS.includes(titulo)) heredados.push(['title', titulo])
  if (heredados.length) add('error', `Hereda metadatos genéricos de la plantilla de AI Studio: ${heredados.map(([k, v]) => `${k}="${v}"`).join(', ')}`)
  else add('ok', 'Sin metadatos genéricos de la plantilla')

  if (!titulo) add('error', 'Sin <title>')
  else if (titulo.length < 30 || titulo.length > 60) add('nota', `El título mide ${titulo.length} caracteres (lo ideal: 30 a 60): «${titulo}»`)
  const desc = metas['description']
  if (!desc) add('error', 'Sin meta description')
  else if (desc.length < 70 || desc.length > 160) add('nota', `La descripción mide ${desc.length} caracteres (lo ideal: 70 a 160)`)
  if (!/<html\b[^>]*\blang="[^"]+"/i.test(html)) add('error', 'El <html> no declara su idioma (lang)')
  if (/noindex/i.test(metas['robots'] || '')) add('error', 'La página pide no ser indexada (meta robots noindex)')
  if (!metas['og:title'] || !metas['og:description']) add('nota', 'Faltan og:title u og:description (vista previa en redes)')
  if (!metas['og:image']) add('nota', 'Sin og:image: AI Studio pondrá una captura como imagen para redes')

  const h1 = (html.match(/<h1\b/gi) || []).length
  if (h1 !== 1) add('nota', h1 ? `Tiene ${h1} encabezados H1 (lo ideal: uno)` : 'Sin encabezado H1')
  const sinAlt = [...html.matchAll(/<img\b[^>]*>/gi)].filter((m) => !/\balt=/i.test(m[0])).length
  if (sinAlt) add('nota', `${sinAlt} imagen(es) sin atributo alt (usa alt="" si es decorativa)`)

  const canonical = (html.match(/<link\b[^>]*\brel="canonical"[^>]*>/i) || [''])[0].match(/\bhref="([^"]+)"/i)?.[1]
  if (url) {
    if (canonical === url) add('ok', `URL canónica: ${url}`)
    else add('error', canonical ? `La URL canónica es ${canonical}, no ${url}` : `Sin URL canónica (debe ser ${url})`)
    if (metas['og:url'] !== url) add('nota', `og:url ${metas['og:url'] ? `es ${metas['og:url']}` : 'falta'} (debe ser ${url})`)
  } else if (!canonical) add('nota', 'Sin URL canónica: se agrega en el SEO final, con el dominio')

  const bloques = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  const invalidos = bloques.filter((b) => {
    try {
      JSON.parse(sinEntidades(b[1]))
      return false
    } catch {
      return true
    }
  })
  if (invalidos.length) add('error', `${invalidos.length} bloque(s) de datos estructurados (JSON-LD) con JSON inválido`)
  else if (bloques.length) add('ok', `${bloques.length} bloque(s) de datos estructurados válidos`)
  else add('nota', 'Sin datos estructurados (JSON-LD): se agregan en el SEO final, con el dominio')
  return r
}

/** robots.txt and sitemap.xml of a site, fetched from `base` (its origin). */
export async function auditarRastreo(base, { url = null } = {}) {
  const r = []
  const add = (nivel, texto) => r.push({ nivel, texto })
  const traer = async (ruta) => {
    try {
      const res = await fetch(base + ruta, { redirect: 'follow' })
      return { status: res.status, texto: res.ok ? await res.text() : '' }
    } catch (e) {
      return { status: 0, texto: '', error: e.message }
    }
  }
  const robots = await traer('/robots.txt')
  const todos = robots.texto.split(/\n(?=\s*user-agent:)/i).find((b) => /user-agent:\s*\*/i.test(b)) || ''
  if (robots.status !== 200) add('nota', `Sin robots.txt (${robots.status || robots.error})`)
  else if (/^\s*disallow:\s*\/\s*$/im.test(todos)) add('error', 'robots.txt bloquea todo el sitio (Disallow: /)')
  else if (/^\s*sitemap:/im.test(robots.texto)) add('ok', 'robots.txt permite indexar y anuncia el sitemap')
  else add(url ? 'error' : 'nota', 'robots.txt no anuncia el sitemap (línea Sitemap:)')
  const sitemap = await traer('/sitemap.xml')
  if (sitemap.status === 200 && url && sitemap.texto.includes(`<loc>${url}</loc>`)) add('ok', 'sitemap.xml lista la página')
  else if (sitemap.status === 200 && !url) add('ok', 'Hay sitemap.xml')
  else add(url ? 'error' : 'nota', sitemap.status === 200 ? `sitemap.xml no lista ${url}` : `Sin sitemap.xml (${sitemap.status || sitemap.error})`)
  return r
}

/** A template literal holding raw text (HTML, CSS, JS): escape what would end it. */
export const literal = (t) => '`' + t.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
      out[k] = v
    } else out._.push(a)
  }
  return out
}
