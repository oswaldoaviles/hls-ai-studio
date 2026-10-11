// Helpers shared by the publicar-en-vercel scripts.
//
// The workspace (`<builds>/<nombre>-vercel/`) holds config.json, the generated site
// (`sitio/`, the folder Vercel receives), optional overrides (`extras/`), estado.json
// and node_modules for the tests (playwright-core). The workspace is the current
// directory, or HLS_ESPACIO.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ESPACIO = path.resolve(process.env.HLS_ESPACIO || process.cwd())
export const WIN = process.platform === 'win32'

/** --clave valor, --bandera, and positional arguments (in `_`). */
export function args(argv = process.argv.slice(2)) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (!t.startsWith('--')) a._.push(t)
    else if (t.includes('=')) a[t.slice(2, t.indexOf('='))] = t.slice(t.indexOf('=') + 1)
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) a[t.slice(2)] = argv[++i]
    else a[t.slice(2)] = true
  }
  return a
}

export const ok = (m) => console.log(`✓ ${m}`)
export const no = (m) => console.log(`✗ ${m}`)
export const aviso = (m) => console.log(`! ${m}`)
export const leer = (f) => fs.readFileSync(f, 'utf8')
export function escribir(f, texto) {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, texto)
}
export const hash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 8)

// ---- config.json ---------------------------------------------------------------------

export const CONFIG = (ws = ESPACIO) => path.join(ws, 'config.json')
export function leerConfig(ws = ESPACIO) {
  const f = CONFIG(ws)
  if (!fs.existsSync(f)) throw new Error(`No hay ${f}. Primero: node <skill>/scripts/preparar.mjs --sitio <carpeta del sitio>`)
  const c = JSON.parse(leer(f))
  c.ghl ||= {}
  c.telefono ||= { prefijo: '52', digitos: 10 }
  c.formularios ||= []
  c.campos ||= {}
  c.redirecciones ||= []
  c.excluir ||= []
  return c
}
export const guardarConfig = (c, ws = ESPACIO) => escribir(CONFIG(ws), JSON.stringify(c, null, 2) + '\n')
export const sitioDe = (c, ws = ESPACIO) => path.resolve(ws, c.sitio)

export const ESTADO = (ws = ESPACIO) => path.join(ws, 'estado.json')
export const leerEstado = (ws = ESPACIO) => (fs.existsSync(ESTADO(ws)) ? JSON.parse(leer(ESTADO(ws))) : {})
export const guardarEstado = (e, ws = ESPACIO) => escribir(ESTADO(ws), JSON.stringify(e, null, 2) + '\n')

/** "marcotrade.mx" from "https://www.marcotrade.mx/" */
export const dominioLimpio = (d) =>
  String(d || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')

// ---- the site's files ----------------------------------------------------------------

// Never published: scroll-craft's working folders, notes, packages, secrets.
const FUERA = new Set([
  'node_modules', 'lab', 'out', 'prompts', 'tools', 'originales', 'source', 'fuentes-originales',
  '.git', '.vercel', '.claude', '.github', '.vscode', '.DS_Store', 'Thumbs.db',
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  '.gitignore', '.vercelignore', 'vercel.json', '.scrollcraft.json',
])
const FUERA_EXT = /\.(md|markdown|psd|ai|sketch|fig|log|zip|mov)$/i

/** Patterns from the site's own .vercelignore / .gitignore that still apply. */
function patronesPropios(sitio) {
  const out = []
  for (const n of ['.vercelignore', '.gitignore']) {
    const f = path.join(sitio, n)
    if (!fs.existsSync(f)) continue
    for (let l of leer(f).split('\n')) {
      l = l.trim()
      if (!l || l.startsWith('#') || l.startsWith('!')) continue
      out.push(l.replace(/^\/+/, '').replace(/\/+$/, ''))
    }
  }
  return out
}
function coincide(rel, patron) {
  if (patron.startsWith('*.')) return rel.toLowerCase().endsWith(patron.slice(1).toLowerCase())
  if (patron.endsWith('*')) return rel.startsWith(patron.slice(0, -1)) || path.basename(rel).startsWith(patron.slice(0, -1))
  if (patron.includes('/')) return rel === patron || rel.startsWith(patron + '/')
  return rel.split('/').includes(patron)
}

/** Every publishable file of the site, as paths relative to it (with "/"). */
export function archivosDelSitio(sitio, excluir = []) {
  const propios = [...patronesPropios(sitio), ...excluir.map((e) => e.replace(/^\/+/, '').replace(/\/+$/, ''))]
  const out = []
  const visitar = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (FUERA.has(e.name) || e.name.startsWith('.env') || (e.name.startsWith('.') && e.isDirectory())) continue
      if (/-(vercel|ai-studio)$/.test(e.name) && e.isDirectory()) continue
      if (propios.some((p) => coincide(r, p))) continue
      if (e.isDirectory()) visitar(path.join(dir, e.name), r)
      else if (e.isFile() && !FUERA_EXT.test(e.name)) out.push(r)
    }
  }
  visitar(sitio, '')
  return out.sort()
}

export const esPagina = (rel) => /\.html?$/i.test(rel)

/** "servicios/torno.html" → "/servicios/torno"; "index.html" → "/"; "blog/index.html" → "/blog" */
export function rutaLimpia(rel) {
  let r = '/' + rel.replace(/\\/g, '/').replace(/\.html?$/i, '')
  r = r.replace(/\/index$/, '') || '/'
  return r
}

/** The id a page gets for its form: index → registro, servicios/web → servicios-web. */
export function idDePagina(rel) {
  const r = rutaLimpia(rel)
  return r === '/' ? 'registro' : r.slice(1).replace(/\//g, '-').toLowerCase()
}

// ---- forms in the HTML (a light scan, no parser: the pages keep their exact text) ----

/** Each <form …>…</form> of a page, in order, with its opening tag and fields. */
export function formulariosDe(html) {
  const out = []
  const re = /<form\b[^>]*>[\s\S]*?<\/form>/gi
  let m
  while ((m = re.exec(html))) {
    const bloque = m[0]
    const apertura = bloque.match(/^<form\b[^>]*>/i)[0]
    const attr = (n, t = apertura) => {
      const x = t.match(new RegExp(`\\s${n}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
      return x ? (x[2] ?? x[3] ?? x[4] ?? '') : null
    }
    const campos = []
    for (const c of bloque.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
      const t = c[0]
      const nombre = attr('name', t)
      if (!nombre) continue
      const tipo = (c[1].toLowerCase() === 'input' ? attr('type', t) || 'text' : c[1]).toLowerCase()
      if (/^(submit|button|reset|image)$/.test(tipo)) continue
      campos.push({ nombre, tipo, requerido: /\srequired\b/i.test(t), autocomplete: attr('autocomplete', t) || '' })
    }
    out.push({
      indice: out.length,
      inicio: m.index,
      apertura,
      id: attr('id'),
      clase: attr('class'),
      action: attr('action'),
      method: attr('method'),
      onsubmit: attr('onsubmit'),
      formId: attr('data-form-id'),
      campos,
    })
  }
  return out
}

const RE_CORREO = /^(e-?mail|correo|correo_?electronico|mail)$/i
const RE_TEL = /^(phone|tel|telefono|teléfono|celular|movil|móvil|whatsapp|wa)$/i
/** Whether a form can create a contact in GHL (it asks for an email or a phone). */
export function tieneContacto(form) {
  return form.campos.some(
    (c) => c.tipo === 'email' || c.tipo === 'tel' || RE_CORREO.test(c.nombre.replace(/[\s-]+/g, '_')) || RE_TEL.test(c.nombre.replace(/[\s-]+/g, '_')) || /email|tel/.test(c.autocomplete),
  )
}
export const vaAWhatsapp = (form) => /wa\.me|whatsapp\.com|^whatsapp:/i.test(form.action || '')

// ---- a local server that behaves like Vercel for a static folder ---------------------

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary',
}

/** Serves `raiz` with cleanUrls (/contacto → contacto.html, /contacto.html → 308) and 404.html. */
export function servir(raiz) {
  const archivo = (rel) => {
    const f = path.join(raiz, rel)
    return f.startsWith(raiz) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null
  }
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    let p = decodeURIComponent(u.pathname)
    if (/\.html$/.test(p)) {
      res.writeHead(308, { location: rutaLimpia(p.slice(1)) + u.search })
      return res.end()
    }
    if (p.length > 1 && p.endsWith('/')) {
      res.writeHead(308, { location: p.replace(/\/+$/, '') + u.search })
      return res.end()
    }
    const rel = p.slice(1)
    const f = archivo(rel || 'index.html') || archivo(rel + '.html') || archivo(path.join(rel, 'index.html'))
    const servirArchivo = (file, status) => {
      const datos = fs.readFileSync(file)
      const tipo = TIPOS[path.extname(file).toLowerCase()] || 'application/octet-stream'
      const rango = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
      if (rango && status === 200) {
        const ini = rango[1] ? +rango[1] : 0
        const fin = rango[2] ? +rango[2] : datos.length - 1
        res.writeHead(206, { 'content-type': tipo, 'content-range': `bytes ${ini}-${fin}/${datos.length}`, 'accept-ranges': 'bytes', 'content-length': fin - ini + 1 })
        return res.end(datos.subarray(ini, fin + 1))
      }
      res.writeHead(status, { 'content-type': tipo, 'content-length': datos.length, 'accept-ranges': 'bytes' })
      res.end(datos)
    }
    if (f) return servirArchivo(f, 200)
    const nf = archivo('404.html')
    if (nf) return servirArchivo(nf, 404)
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('404')
  })
  return new Promise((resolve) =>
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://localhost:${srv.address().port}`, cerrar: () => srv.close() })),
  )
}

// ---- packages installed in the workspace (playwright-core) -----------------------------

export async function cargar(nombre, dir = ESPACIO) {
  const base = path.join(dir, 'node_modules', ...nombre.split('/'))
  const pj = path.join(base, 'package.json')
  if (!fs.existsSync(pj)) throw new Error(`Falta "${nombre}" en ${dir}. Corre: node <skill>/scripts/doctor.mjs --preparar`)
  const pkg = JSON.parse(leer(pj))
  const pick = (e) => (typeof e === 'string' ? e : e && (pick(e.import) || pick(e.node) || pick(e.default) || pick(e.require)))
  const exp = pkg.exports && (typeof pkg.exports === 'string' || pkg.exports.import ? pkg.exports : pkg.exports['.'])
  const mod = await import(pathToFileURL(path.join(base, pick(exp) || pkg.main || 'index.js')).href)
  return mod.default && Object.keys(mod).length === 1 ? mod.default : mod
}

// ---- the Vercel CLI (always the latest, through npx; no global install) ----------------

const NPX = WIN ? 'npx.cmd' : 'npx'
export function vercelArgs(c, resto) {
  const a = ['--yes', 'vercel@latest', ...resto]
  if (c && c.equipo) a.push('--scope', c.equipo)
  return a
}
/** Runs a Vercel command and returns {status, salida} (stdout + stderr). */
export function vercel(c, resto, opciones = {}) {
  const r = spawnSync(NPX, vercelArgs(c, resto), { encoding: 'utf8', shell: WIN, timeout: opciones.timeout || 180000, cwd: opciones.cwd, input: '' })
  return { status: r.status, salida: `${r.stdout || ''}${r.stderr || ''}` }
}
/** The same, streaming, with a deadline; resolves with whatever it printed. */
export function vercelEnVivo(c, resto, { cwd, limite = 240000, alVer } = {}) {
  return new Promise((resolve) => {
    const p = spawn(NPX, vercelArgs(c, resto), { cwd, shell: WIN })
    let salida = ''
    let vencido = false
    const t = setTimeout(() => {
      vencido = true
      p.kill()
    }, limite)
    const leerTrozo = (d) => {
      salida += d
      alVer && alVer(salida)
    }
    p.stdout.on('data', leerTrozo)
    p.stderr.on('data', leerTrozo)
    p.on('close', (status) => {
      clearTimeout(t)
      resolve({ status, salida, vencido })
    })
  })
}

export const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), n))
