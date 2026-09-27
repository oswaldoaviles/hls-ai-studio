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
